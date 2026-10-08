// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "MMOWebHud.generated.h"

class UOverlay;
class UCanvasPanel;
class UMMOWebBrowser;
class UMMOHudBridge;
class UImage;
class UTextureRenderTarget2D;
class ASceneCapture2D;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FMMOHudEventSignature, const FString&, Payload);

/**
 *  Full-screen MMO HUD: a transparent CEF web layer (React DOM) composited over
 *  a native canvas that hosts scene-capture viewports.
 *
 *  React marks DOM regions with a viewport id; the web layer posts the element's
 *  normalized rect over the `ue.hud` JS binding; this widget positions a live
 *  SceneCapture2D render target *under* the transparent page so 3D content
 *  appears inside the web UI with DOM chrome on top.
 */
UCLASS(BlueprintType)
class UMMOWebHud : public UUserWidget
{
	GENERATED_BODY()

public:

	UMMOWebHud(const FObjectInitializer& ObjectInitializer);

	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

	/** Bridge entry points — payloads are JSON strings from the web layer. */
	void BridgeRegisterViewport(const FString& Payload);
	void BridgeMoveViewport(const FString& Payload);
	void BridgeUnregisterViewport(const FString& Payload);
	void BridgeNotify(const FString& Payload);

	/** Execute a script inside the page (UE -> JS). */
	void SendToPage(const FString& Script);

	/** Drop all scene-capture actors, images and render targets (call on world travel). */
	void ResetViewports();

	/** Generic event relayed to Blueprint listeners. */
	UPROPERTY(BlueprintAssignable, Category="HUD")
	FMMOHudEventSignature OnHudEvent;

protected:

	/** [0] native capture layer, [1] transparent browser */
	UPROPERTY() UOverlay* RootOverlay;
	UPROPERTY() UCanvasPanel* ViewportLayer;
	UPROPERTY() UMMOWebBrowser* Browser;
	UPROPERTY() UMMOHudBridge* Bridge;

	UPROPERTY() TMap<FString, UImage*> ViewportImages;
	UPROPERTY() TMap<FString, UTextureRenderTarget2D*> ViewportTargets;
	UPROPERTY() TMap<FString, ASceneCapture2D*> ViewportCaptures;

	/** Last normalized rect per id, for resize tracking. */
	TMap<FString, FBox2D> ViewportRects;

	bool bBridgeBound = false;

	void ApplyRect(const FString& Id, const FBox2D& NormalizedRect);
	void ApplyGameplayInputSuspension();
	UTextureRenderTarget2D* EnsureTarget(const FString& Id, const FIntPoint& PixelSize);
	ASceneCapture2D* SpawnCapture(const FVector& Loc, const FRotator& Rot, float Fov);
};
