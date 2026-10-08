// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOWebHud.h"
#include "MMOWebBrowser.h"
#include "MMOHudBridge.h"

#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"
#include "Components/Widget.h"
#include "Blueprint/WidgetTree.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/Image.h"
#include "Engine/SceneCapture2D.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Kismet/GameplayStatics.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Framework/Application/IInputProcessor.h"
#include "Framework/Application/SlateApplication.h"
#include "Input/Events.h"
#include "GenericPlatform/GenericApplication.h"
#include "Widgets/SViewport.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"

// -- RMB camera-orbit passthrough --------------------------------------------
// SWebBrowser answers FReply::Handled() for every mouse button
// (FCEFWebBrowserWindow::OnMouseButtonDown), so a fullscreen browser swallows
// RMB before FInputModeGameAndUI can offer it to the game viewport. This
// preprocessor intercepts RMB at the application level and drives the pawn's
// yaw/pitch input directly — but only when the page reports the cursor is NOT
// over an interactive DOM element (ue.hud.notify {event:"pointer.overui"}),
// which is installed by OrbitHooksScript below.

namespace
{

/** Set from JS: true while the cursor rests on an interactive DOM element. */
bool GWebPointerOverUi = false;

/** Set from JS: true while a DOM text field has focus — gameplay input suspended. */
bool GWebUiTextFocused = false;

/** Diagnostic: key-down events seen at the application input level. */
int32 GMMOKeyEventsSeen = 0;

class FMMOOrbitInputProcessor : public IInputProcessor
{
public:
	explicit FMMOOrbitInputProcessor(UMMOWebHud* InHud) : Hud(InHud) {}

	bool HasValidHud() const { return Hud.IsValid(); }
	virtual const TCHAR* GetDebugName() const override { return TEXT("MMOOrbitInput"); }

	virtual void Tick(const float, FSlateApplication& SlateApp, TSharedRef<ICursor> Cursor) override
	{
		if (!bOrbiting)
			return;

		// The move/up handlers cover the normal release path; this is the safety
		// net for the button-up being lost to an OS-level focus change.
		if (!SlateApp.GetPressedMouseButtons().Contains(EKeys::RightMouseButton))
		{
			EndOrbit();
			return;
		}

		const FVector2D Pos = Cursor->GetPosition();
		const FVector2D Delta = Pos - OrbitAnchor;
		if (!Delta.IsNearlyZero())
		{
			if (Hud.IsValid())
			{
				if (APawn* Pawn = Hud->GetOwningPlayerPawn())
				{
					Pawn->AddControllerYawInput(Delta.X);
					Pawn->AddControllerPitchInput(Delta.Y);
				}
			}
			// Re-pin the cursor so it can't hit the screen edge mid-drag; the
			// synthetic move this generates is consumed below while bOrbiting.
			Cursor->SetPosition(FMath::RoundToInt(OrbitAnchor.X), FMath::RoundToInt(OrbitAnchor.Y));
		}
	}

	virtual bool HandleMouseButtonDownEvent(FSlateApplication& SlateApp, const FPointerEvent& MouseEvent) override
	{
		if (bOrbiting
			|| MouseEvent.GetEffectingButton() != EKeys::RightMouseButton
			|| GWebPointerOverUi
			|| !Hud.IsValid()
			|| !Hud->IsInViewport()
			|| !Hud->GetOwningPlayer()
			|| !IsInGameViewport(SlateApp))
		{
			return false;
		}

		bOrbiting = true;
		OrbitAnchor = SlateApp.GetPlatformApplication()->Cursor->GetPosition();
		Hud->GetOwningPlayer()->SetShowMouseCursor(false);
		return true;
	}

	virtual bool HandleMouseMoveEvent(FSlateApplication&, const FPointerEvent& MouseEvent) override
	{
		if (!bOrbiting)
			return false;
		if (!MouseEvent.IsMouseButtonDown(EKeys::RightMouseButton))
		{
			EndOrbit();
			return false;
		}
		// Consume moves during orbit so the page stops seeing hover updates.
		return true;
	}

	virtual bool HandleMouseButtonUpEvent(FSlateApplication&, const FPointerEvent& MouseEvent) override
	{
		if (bOrbiting && MouseEvent.GetEffectingButton() == EKeys::RightMouseButton)
		{
			EndOrbit();
			return true;
		}
		return false;
	}

	virtual bool HandleMouseButtonDoubleClickEvent(FSlateApplication&, const FPointerEvent& MouseEvent) override
	{
		return bOrbiting && MouseEvent.GetEffectingButton() == EKeys::RightMouseButton;
	}

	virtual bool HandleKeyDownEvent(FSlateApplication&, const FKeyEvent&) override
	{
		GMMOKeyEventsSeen++;
		return false;
	}

private:
	bool IsInGameViewport(FSlateApplication& SlateApp) const
	{
		const TSharedPtr<SViewport> GameViewport = SlateApp.GetGameViewport();
		if (!GameViewport.IsValid())
			return false;
		// Don't steal right-clicks aimed at an editor window floating over PIE.
		if (SlateApp.GetActiveTopLevelWindow() != SlateApp.FindWidgetWindow(GameViewport.ToSharedRef()))
			return false;
		const FVector2D CursorPos = SlateApp.GetPlatformApplication()->Cursor->GetPosition();
		return GameViewport->GetCachedGeometry().IsUnderLocation(CursorPos);
	}

	void EndOrbit()
	{
		bOrbiting = false;
		if (Hud.IsValid())
		{
			if (APlayerController* PC = Hud->GetOwningPlayer())
				PC->SetShowMouseCursor(true);
		}
	}

	TWeakObjectPtr<UMMOWebHud> Hud;
	bool bOrbiting = false;
	FVector2D OrbitAnchor = FVector2D::ZeroVector;
};

TSharedPtr<FMMOOrbitInputProcessor> GOrbitProcessor;

/**
 * Installed into the page via EvalJs. Reports whether the cursor is over an
 * interactive DOM node — e.target already honors pointer-events:none, so CSS
 * on the page controls where RMB-orbit is allowed. Also suppresses the native
 * context menu (React onContextMenu handlers still fire).
 */
const TCHAR* OrbitHooksScript = TEXT(R"JS(
(function(){
    if (window.__mmoOrbitHooks) return;
    window.__mmoOrbitHooks = true;
    var SEL = 'a,button,input,textarea,select,option,label,summary,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[contenteditable="true"],[onclick],[data-ui-interactive]';
    var last = null;
    document.addEventListener('mousemove', function(e){
        var el = e.target;
        var over = !!(el && el.nodeType === 1 && el.closest && el.closest(SEL));
        if (over !== last && window.ue && ue.hud && ue.hud.notify) {
            last = over;
            ue.hud.notify(JSON.stringify({event:'pointer.overui', over:over}));
        }
    }, true);
    document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, true);
})();
)JS");

}

UMMOWebHud::UMMOWebHud(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
}

void UMMOWebHud::NativeOnInitialized()
{
	Super::NativeOnInitialized();

	// Build the widget tree here, not NativeConstruct: RebuildWidget reads
	// WidgetTree->RootWidget before OnWidgetRebuilt fires NativeConstruct, so a
	// root assigned in NativeConstruct is too late (slate becomes an SSpacer).
	if (WidgetTree->RootWidget)
		return;

	RootOverlay = WidgetTree->ConstructWidget<UOverlay>(UOverlay::StaticClass(), TEXT("Root"));
	WidgetTree->RootWidget = RootOverlay;

	ViewportLayer = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("ViewportLayer"));
	UOverlaySlot* LayerSlot = RootOverlay->AddChildToOverlay(ViewportLayer);
	LayerSlot->SetHorizontalAlignment(HAlign_Fill);
	LayerSlot->SetVerticalAlignment(VAlign_Fill);

	Browser = WidgetTree->ConstructWidget<UMMOWebBrowser>(UMMOWebBrowser::StaticClass(), TEXT("Browser"));
	UOverlaySlot* BrowserSlot = RootOverlay->AddChildToOverlay(Browser);
	BrowserSlot->SetHorizontalAlignment(HAlign_Fill);
	BrowserSlot->SetVerticalAlignment(VAlign_Fill);

	Bridge = NewObject<UMMOHudBridge>(this, TEXT("HudBridge"));
	Bridge->Hud = this;

	UE_LOG(LogTemp, Log, TEXT("MMOWebHud::NativeOnInitialized - tree built"));
}

void UMMOWebHud::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);

	// Keep one orbit preprocessor bound to the newest HUD instance. Safe to do
	// from a widget tick — we're outside any slate input callback here.
	if (FSlateApplication::IsInitialized())
	{
		if (GOrbitProcessor && !GOrbitProcessor->HasValidHud())
		{
			FSlateApplication::Get().UnregisterInputPreProcessor(GOrbitProcessor);
			GOrbitProcessor.Reset();
		}
		if (!GOrbitProcessor)
		{
			GOrbitProcessor = MakeShared<FMMOOrbitInputProcessor>(this);
			FSlateApplication::Get().RegisterInputPreProcessor(GOrbitProcessor);
		}
	}

	static float DiagAccum = 0.f;
	DiagAccum += InDeltaTime;
	if (DiagAccum >= 3.f)
	{
		DiagAccum = 0.f;
		FString FocusDesc = TEXT("none");
		FString PawnDesc = TEXT("none");
		if (FSlateApplication::IsInitialized())
		{
			if (TSharedPtr<SWidget> Focused = FSlateApplication::Get().GetKeyboardFocusedWidget())
			{
				FocusDesc = Focused->GetType().ToString();
			}
		}
		int32 MoveMode = -1;
		int32 Bindings = -1;
		bool bMoveIgnored = false;
		if (APlayerController* PC = GetOwningPlayer())
		{
			PawnDesc = FString::Printf(TEXT("%s/%s"),
				PC->GetPawn() ? *PC->GetPawn()->GetName() : TEXT("nopawn"),
				*PC->GetStateName().ToString());
			bMoveIgnored = PC->IsMoveInputIgnored();
			if (APawn* Pawn = PC->GetPawn())
			{
				if (UCharacterMovementComponent* MC = Cast<UCharacterMovementComponent>(Pawn->GetMovementComponent()))
				{
					MoveMode = (int32)MC->MovementMode.GetValue();
				}
				if (Pawn->InputComponent)
				{
					Bindings = Pawn->InputComponent->GetNumActionBindings();
				}
			}
		}
		UE_LOG(LogTemp, Warning,
			TEXT("MMOHUD diag: pawn=%s focus=%s movemode=%d binds=%d ignoremove=%d keys=%d bound=%d"),
			*PawnDesc, *FocusDesc, MoveMode, Bindings, bMoveIgnored ? 1 : 0,
			GMMOKeyEventsSeen, bBridgeBound ? 1 : 0);
	}

	// The underlying SWebBrowser exists only after the widget tree builds;
	// bind as soon as it appears, then reload so the page sees `ue.hud`.
	// IsBound() drops back to false if the slate browser is rebuilt (e.g. after
	// travel), so this re-binds and reloads on the new browser too.
	if (Browser && !Browser->IsBound())
	{
		Browser->BindObject(TEXT("hud"), Bridge);
		if (Browser->IsBound())
		{
			bBridgeBound = true;
			Browser->ReloadPage();
		}
	}

	// Re-inject the orbit hooks periodically — the guard in the script makes it
	// a no-op once installed, and re-injection covers page reloads/navigation.
	static float OrbitHooksAccum = 0.f;
	if (bBridgeBound && Browser)
	{
		OrbitHooksAccum += InDeltaTime;
		if (OrbitHooksAccum >= 1.5f)
		{
			OrbitHooksAccum = 0.f;
			Browser->EvalJs(OrbitHooksScript);
		}
	}
}

// -- bridge entry points ---------------------------------------------------

void UMMOWebHud::BridgeRegisterViewport(const FString& Payload)
{
	TSharedPtr<FJsonObject> Json;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Payload), Json))
		return;

	const FString Id = Json->GetStringField(TEXT("id"));
	if (Id.IsEmpty())
		return;

	FBox2D Rect(FVector2D(0.f, 0.f), FVector2D(0.2f, 0.2f));
	const TSharedPtr<FJsonObject>* RectObj;
	if (Json->TryGetObjectField(TEXT("rect"), RectObj))
	{
		Rect.Min.X = (*RectObj)->GetNumberField(TEXT("x"));
		Rect.Min.Y = (*RectObj)->GetNumberField(TEXT("y"));
		Rect.Max.X = Rect.Min.X + (*RectObj)->GetNumberField(TEXT("w"));
		Rect.Max.Y = Rect.Min.Y + (*RectObj)->GetNumberField(TEXT("h"));
	}

	// camera config — default: framed on the player pawn
	FVector Loc = FVector::ZeroVector;
	FRotator Rot = FRotator::ZeroRotator;
	float Fov = 30.f;
	if (APawn* Pawn = GetOwningPlayerPawn())
	{
		Loc = Pawn->GetActorLocation() + Pawn->GetActorForwardVector() * 220.f + FVector(0, 0, 60.f);
		Rot = (Pawn->GetActorLocation() + FVector(0, 0, 70.f) - Loc).Rotation();
	}
	const TSharedPtr<FJsonObject>* CamObj;
	if (Json->TryGetObjectField(TEXT("camera"), CamObj))
	{
		const TArray<TSharedPtr<FJsonValue>>* LocArr;
		if ((*CamObj)->TryGetArrayField(TEXT("location"), LocArr) && LocArr->Num() >= 3)
			Loc = FVector((*LocArr)[0]->AsNumber(), (*LocArr)[1]->AsNumber(), (*LocArr)[2]->AsNumber());
		const TArray<TSharedPtr<FJsonValue>>* RotArr;
		if ((*CamObj)->TryGetArrayField(TEXT("rotation"), RotArr) && RotArr->Num() >= 3)
			Rot = FRotator((*RotArr)[0]->AsNumber(), (*RotArr)[1]->AsNumber(), (*RotArr)[2]->AsNumber());
		Fov = (*CamObj)->GetNumberField(TEXT("fov"));
	}

	if (!ViewportImages.Contains(Id))
	{
		UImage* Img = WidgetTree->ConstructWidget<UImage>(UImage::StaticClass(), *FString::Printf(TEXT("VP_%s"), *Id));
		UCanvasPanelSlot* CanvasSlot = ViewportLayer->AddChildToCanvas(Img);
		CanvasSlot->SetAutoSize(false);
		ViewportImages.Add(Id, Img);
		ViewportCaptures.Add(Id, SpawnCapture(Loc, Rot, Fov));
	}

	ViewportRects.Add(Id, Rect);
	ApplyRect(Id, Rect);
}

void UMMOWebHud::BridgeMoveViewport(const FString& Payload)
{
	TSharedPtr<FJsonObject> Json;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Payload), Json))
		return;
	const FString Id = Json->GetStringField(TEXT("id"));
	const TSharedPtr<FJsonObject>* RectObj;
	if (!Json->TryGetObjectField(TEXT("rect"), RectObj))
		return;
	FBox2D Rect;
	Rect.Min.X = (*RectObj)->GetNumberField(TEXT("x"));
	Rect.Min.Y = (*RectObj)->GetNumberField(TEXT("y"));
	Rect.Max.X = Rect.Min.X + (*RectObj)->GetNumberField(TEXT("w"));
	Rect.Max.Y = Rect.Min.Y + (*RectObj)->GetNumberField(TEXT("h"));
	ViewportRects.Add(Id, Rect);
	ApplyRect(Id, Rect);
}

void UMMOWebHud::BridgeUnregisterViewport(const FString& Payload)
{
	TSharedPtr<FJsonObject> Json;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Payload), Json))
		return;
	const FString Id = Json->GetStringField(TEXT("id"));

	if (UImage** Img = ViewportImages.Find(Id))
	{
		(*Img)->RemoveFromParent();
		ViewportImages.Remove(Id);
	}
	if (ASceneCapture2D** Cap = ViewportCaptures.Find(Id))
	{
		(*Cap)->Destroy();
		ViewportCaptures.Remove(Id);
	}
	ViewportTargets.Remove(Id);
	ViewportRects.Remove(Id);
}

void UMMOWebHud::BridgeNotify(const FString& Payload)
{
	// Intercept the orbit-passThrough hover report before it reaches BP listeners.
	TSharedPtr<FJsonObject> Json;
	if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Payload), Json))
	{
		FString Event;
		if (Json->TryGetStringField(TEXT("event"), Event) && Event == TEXT("pointer.overui"))
		{
			Json->TryGetBoolField(TEXT("over"), GWebPointerOverUi);
			return;
		}
		if (Event == TEXT("ui.textfocus"))
		{
			bool bFocused = false;
			const TSharedPtr<FJsonObject>* Data;
			if (Json->TryGetObjectField(TEXT("data"), Data)
				&& (*Data)->TryGetBoolField(TEXT("focused"), bFocused)
				&& bFocused != GWebUiTextFocused)
			{
				GWebUiTextFocused = bFocused;
				ApplyGameplayInputSuspension();
			}
			return;
		}
	}
	OnHudEvent.Broadcast(Payload);
}

void UMMOWebHud::ApplyGameplayInputSuspension()
{
	// Suspend gameplay input while the user types into a DOM field: removing
	// the gameplay mapping context blocks move/jump/etc under Enhanced Input
	// regardless of which Slate widget holds focus. IMC_MouseLook stays on so
	// RMB orbit keeps working.
	APlayerController* PC = GetOwningPlayer();
	ULocalPlayer* LP = PC ? PC->GetLocalPlayer() : nullptr;
	UEnhancedInputLocalPlayerSubsystem* Subsystem =
		LP ? LP->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>() : nullptr;
	if (!Subsystem)
	{
		return;
	}
	UInputMappingContext* GameplayContext = LoadObject<UInputMappingContext>(
		nullptr, TEXT("/Game/Input/IMC_Default.IMC_Default"));
	if (!GameplayContext)
	{
		return;
	}
	if (GWebUiTextFocused)
	{
		Subsystem->RemoveMappingContext(GameplayContext);
	}
	else if (!Subsystem->HasMappingContext(GameplayContext))
	{
		Subsystem->AddMappingContext(GameplayContext, 0);
	}
	UE_LOG(LogTemp, Log, TEXT("MMOHUD: ui text focus=%d — gameplay input %s"),
		GWebUiTextFocused, GWebUiTextFocused ? TEXT("suspended") : TEXT("restored"));
}

void UMMOWebHud::SendToPage(const FString& Script)
{
	if (Browser)
	{
		Browser->EvalJs(Script);
	}
}

void UMMOWebHud::ResetViewports()
{
	for (const TPair<FString, ASceneCapture2D*>& Pair : ViewportCaptures)
	{
		if (Pair.Value)
		{
			Pair.Value->Destroy();
		}
	}
	for (const TPair<FString, UImage*>& Pair : ViewportImages)
	{
		if (Pair.Value)
		{
			Pair.Value->RemoveFromParent();
		}
	}
	ViewportCaptures.Reset();
	ViewportImages.Reset();
	ViewportTargets.Reset();
	ViewportRects.Reset();
}

// -- internals --------------------------------------------------------------

void UMMOWebHud::ApplyRect(const FString& Id, const FBox2D& NormalizedRect)
{
	UImage** ImgPtr = ViewportImages.Find(Id);
	if (!ImgPtr || !*ImgPtr)
		return;

	if (UCanvasPanelSlot* CanvasSlot = Cast<UCanvasPanelSlot>((*ImgPtr)->Slot))
	{
		CanvasSlot->SetAnchors(FAnchors(NormalizedRect.Min.X, NormalizedRect.Min.Y,
										NormalizedRect.Max.X, NormalizedRect.Max.Y));
		CanvasSlot->SetOffsets(FMargin(0.f));
	}

	// size the render target to the canvas pixel footprint of the rect
	if (ViewportLayer)
	{
		const FVector2D CanvasSize = ViewportLayer->GetCachedGeometry().GetLocalSize();
		const FIntPoint Px(
			FMath::Max(64, FMath::RoundToInt(CanvasSize.X * NormalizedRect.GetSize().X)),
			FMath::Max(64, FMath::RoundToInt(CanvasSize.Y * NormalizedRect.GetSize().Y)));

		UTextureRenderTarget2D* RT = EnsureTarget(Id, Px);
		if (RT && ViewportCaptures.Contains(Id))
			ViewportCaptures[Id]->GetCaptureComponent2D()->TextureTarget = RT;
		if (RT)
		{
			FSlateBrush Brush;
			Brush.SetResourceObject(RT);
			Brush.ImageSize = FVector2D(Px);
			(*ImgPtr)->SetBrush(Brush);
		}
	}
}

UTextureRenderTarget2D* UMMOWebHud::EnsureTarget(const FString& Id, const FIntPoint& PixelSize)
{
	UTextureRenderTarget2D* RT = ViewportTargets.FindRef(Id);
	if (RT && RT->SizeX == PixelSize.X && RT->SizeY == PixelSize.Y)
		return RT;

	RT = NewObject<UTextureRenderTarget2D>(this);
	RT->RenderTargetFormat = ETextureRenderTargetFormat::RTF_RGBA8;
	RT->bGPUSharedFlag = false;
	RT->InitCustomFormat(PixelSize.X, PixelSize.Y, EPixelFormat::PF_B8G8R8A8, false);
	RT->UpdateResourceImmediate(true);
	ViewportTargets.Add(Id, RT);
	return RT;
}

ASceneCapture2D* UMMOWebHud::SpawnCapture(const FVector& Loc, const FRotator& Rot, float Fov)
{
	UWorld* World = GetWorld();
	if (!World)
		return nullptr;

	ASceneCapture2D* Cap = World->SpawnActor<ASceneCapture2D>(Loc, Rot);
	if (Cap && Cap->GetCaptureComponent2D())
	{
		USceneCaptureComponent2D* C = Cap->GetCaptureComponent2D();
		C->FOVAngle = Fov;
		C->CaptureSource = ESceneCaptureSource::SCS_FinalColorLDR;
		C->bCaptureEveryFrame = true;
		C->bCaptureOnMovement = true;
	}
	return Cap;
}
