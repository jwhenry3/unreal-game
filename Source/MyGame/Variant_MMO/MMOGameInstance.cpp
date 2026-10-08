// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOGameInstance.h"

#include "MMOGameMode.h"
#include "UI/MMOWebHud.h"

#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

void UMMOGameInstance::Init()
{
	Super::Init();

	if (PostLoginMap.IsNull())
	{
		PostLoginMap = FSoftObjectPath(TEXT("/Game/ThirdPerson/Lvl_ThirdPerson.Lvl_ThirdPerson"));
	}

	WorldInitHandle = FWorldDelegates::OnPostWorldInitialization.AddUObject(
		this, &UMMOGameInstance::OnPostWorldInit);

	UE_LOG(LogTemp, Log, TEXT("MMOGameInstance::Init - web HUD bootstrap armed"));
}

void UMMOGameInstance::StartGameInstance()
{
	Super::StartGameInstance();

	// In PIE the world is initialized before the GameInstance exists, so the
	// OnPostWorldInitialization binding below can miss the first world. By now
	// the world and game viewport both exist — spawn directly.
	UWorld* World = GetWorld();
	UE_LOG(LogTemp, Log, TEXT("MMOGameInstance::StartGameInstance world=%s"),
		World ? *World->GetName() : TEXT("null"));
	EnsureWebHud(World);
}

void UMMOGameInstance::Shutdown()
{
	FWorldDelegates::OnPostWorldInitialization.Remove(WorldInitHandle);
	Super::Shutdown();
}

// -- web HUD lifecycle -------------------------------------------------------

void UMMOGameInstance::OnPostWorldInit(UWorld* World, const UWorld::InitializationValues)
{
	if (!World || !World->IsGameWorld())
	{
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("MMOGameInstance: post-world-init %s"), *World->GetName());
	EnsureWebHud(World);

	if (WebHud)
	{
		// captures from the previous world died with it
		WebHud->ResetViewports();
		PushPhase();
		PushServers();
	}

	if (Phase == TEXT("game"))
	{
		// The local PlayerState may not have replicated yet; retry briefly.
		TryPushAllPlayerState();
	}

	// fallback in case the viewport wasn't ready during init
	World->OnWorldBeginPlay.AddUObject(this, &UMMOGameInstance::OnWorldBeginPlayFallback);
}

void UMMOGameInstance::OnWorldBeginPlayFallback()
{
	UE_LOG(LogTemp, Log, TEXT("MMOGameInstance: world begin play, hud_invp=%d"),
		WebHud ? (int32)WebHud->IsInViewport() : -1);
	if (bEnableWebHud && (!WebHud || !WebHud->IsInViewport()))
	{
		EnsureWebHud(GetWorld());
	}
}

void UMMOGameInstance::EnsureWebHud(UWorld* World)
{
	if (!bEnableWebHud || !World)
	{
		return;
	}

	if (!WebHud)
	{
		// UUserWidget::Initialize skips NativeOnInitialized when the widget has
		// no valid PlayerContext, so a widget created before the local player
		// exists never builds its widget tree (Browser stays null forever).
		// Bind the widget to the PlayerController so the context is guaranteed.
		APlayerController* PC = World->GetFirstPlayerController();
		if (!PC)
		{
			return;
		}
		WebHud = CreateWidget<UMMOWebHud>(PC, UMMOWebHud::StaticClass());
		UE_LOG(LogTemp, Log, TEXT("MMOGameInstance: CreateWidget -> %s"), WebHud ? TEXT("ok") : TEXT("NULL"));
		if (!WebHud)
		{
			return;
		}
		WebHud->OnHudEvent.AddDynamic(this, &UMMOGameInstance::HandleHudEvent);
	}

	if (!WebHud->IsInViewport())
	{
		// Anchor the widget to fill the viewport — the default anchors collapse
		// it to a desired-size square in the top-left.
		WebHud->SetAnchorsInViewport(FAnchors(0.f, 0.f, 1.f, 1.f));
		WebHud->SetPadding(FMargin(0.f));
		WebHud->SetAlignmentInViewport(FVector2D::ZeroVector);
		WebHud->AddToViewport(0);
		UE_LOG(LogTemp, Log, TEXT("MMOGameInstance: web HUD added to viewport"));
	}
}

void UMMOGameInstance::SendToWeb(const FString& Json)
{
	if (WebHud)
	{
		WebHud->SendToPage(FString::Printf(TEXT("window.ueDispatch && window.ueDispatch(%s);"), *Json));
	}
}

// -- page -> game events -----------------------------------------------------

void UMMOGameInstance::HandleHudEvent(const FString& Payload)
{
	TSharedPtr<FJsonObject> Json;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Payload), Json))
	{
		return;
	}

	const FString Event = Json->GetStringField(TEXT("event"));

	const TSharedPtr<FJsonObject>* DataObj = nullptr;
	Json->TryGetObjectField(TEXT("data"), DataObj);
	const TSharedPtr<FJsonObject> Data = DataObj ? *DataObj : nullptr;

	if (Event == TEXT("hello"))
	{
		PushPhase();
		PushServers();
	}
	else if (Event == TEXT("login.submit"))
	{
		const FString Username = Data ? Data->GetStringField(TEXT("username")) : FString();
		const FString Password = Data ? Data->GetStringField(TEXT("password")) : FString();
		const FString ServerName = Data ? Data->GetStringField(TEXT("serverName")) : FString();
		bool bRememberMe = false;
		if (Data)
		{
			Data->TryGetBoolField(TEXT("rememberMe"), bRememberMe);
		}
		SubmitLogin(Username, Password, ServerName, bRememberMe);
	}
	else if (Event == TEXT("login.quit"))
	{
		UKismetSystemLibrary::QuitGame(this, UGameplayStatics::GetPlayerController(this, 0), EQuitPreference::Quit, false);
	}
	else if (Event == TEXT("register.submit"))
	{
		const FString RegUsername = Data ? Data->GetStringField(TEXT("username")) : FString();
		const FString RegEmail = Data ? Data->GetStringField(TEXT("email")) : FString();
		const FString RegPassword = Data ? Data->GetStringField(TEXT("password")) : FString();
		SubmitRegister(RegUsername, RegEmail, RegPassword);
	}
	else if (Event == TEXT("character.select"))
	{
		const FString CharacterId = Data ? Data->GetStringField(TEXT("characterId")) : FString();
		if (!CharacterId.IsEmpty())
		{
			SelectCharacter(CharacterId);
		}
	}
	else if (Event == TEXT("character.create"))
	{
		const FString Name = Data ? Data->GetStringField(TEXT("name")) : FString();
		const FString Job = Data ? Data->GetStringField(TEXT("job")) : FString();
		const FString SubJob = Data ? Data->GetStringField(TEXT("subJob")) : FString();
		if (!Name.IsEmpty())
		{
			CreateCharacter(Name, Job, SubJob);
		}
	}
	else if (Event == TEXT("hud.ready"))
	{
		TryPushAllPlayerState();
	}
}

// -- auth --------------------------------------------------------------------

void UMMOGameInstance::SubmitLogin(const FString& Username, const FString& Password, const FString& ServerName, bool bRememberMe)
{
	if (bLoginInFlight)
	{
		return;
	}

	SelectedServerName = ServerName;

	if (Username.IsEmpty() || Password.IsEmpty())
	{
		PushLoginResult(false, TEXT("Enter an account name and password."));
		return;
	}

	if (OnAuthenticationRequested.IsBound())
	{
		bLoginInFlight = true;
		OnAuthenticationRequested.Broadcast(Username, Password, ServerName, bRememberMe);
		return;
	}

	if (!AuthBaseUrl.IsEmpty())
	{
		bLoginInFlight = true;

		TSharedPtr<FJsonObject> Body = MakeShared<FJsonObject>();
		Body->SetStringField(TEXT("username"), Username);
		Body->SetStringField(TEXT("password"), Password);
		if (!ServerName.IsEmpty())
		{
			Body->SetStringField(TEXT("serverName"), ServerName);
		}
		Body->SetBoolField(TEXT("rememberMe"), bRememberMe);

		FString BodyText;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyText);
		FJsonSerializer::Serialize(Body.ToSharedRef(), Writer);

		TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
		Request->SetURL(AuthBaseUrl + TEXT("/auth/login"));
		Request->SetVerb(TEXT("POST"));
		Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
		Request->SetContentAsString(BodyText);
		Request->OnProcessRequestComplete().BindUObject(this, &UMMOGameInstance::OnLoginResponse);
		Request->ProcessRequest();
		return;
	}

	if (bAllowDevelopmentLogin)
	{
		bLoginInFlight = true;
		CompleteLogin(true, FText::GetEmpty());
		return;
	}

	PushLoginResult(false, TEXT("Authentication service is not configured."));
}

void UMMOGameInstance::OnLoginResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected)
{
	bLoginInFlight = false;

	if (!bConnected || !Response.IsValid())
	{
		if (bAllowDevelopmentLogin)
		{
			UE_LOG(LogTemp, Warning, TEXT("MMOGameInstance: auth backend unreachable at %s, using development login."), *AuthBaseUrl);
			CompleteLogin(true, FText::GetEmpty());
			return;
		}
		CompleteLogin(false, NSLOCTEXT("MMOLogin", "AuthUnreachable", "Could not reach the authentication server."));
		return;
	}

	TSharedPtr<FJsonObject> Json;
	const bool bParsed = FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Json);

	if (Response->GetResponseCode() / 100 == 2 && bParsed)
	{
		AccessToken = Json->GetStringField(TEXT("accessToken"));
		RefreshToken = Json->GetStringField(TEXT("refreshToken"));
		CompleteLogin(true, FText::GetEmpty());
		return;
	}

	FString Message = FString::Printf(TEXT("Login failed (%d)."), Response->GetResponseCode());
	if (bParsed)
	{
		const TSharedPtr<FJsonValue> MsgValue = Json->TryGetField(TEXT("message"));
		if (MsgValue.IsValid())
		{
			if (MsgValue->Type == EJson::String)
			{
				Message = MsgValue->AsString();
			}
			else if (MsgValue->Type == EJson::Array && MsgValue->AsArray().Num() > 0)
			{
				Message = MsgValue->AsArray()[0]->AsString();
			}
		}
	}
	CompleteLogin(false, FText::FromString(Message));
}

void UMMOGameInstance::SubmitRegister(const FString& Username, const FString& Email, const FString& Password)
{
	if (bLoginInFlight)
	{
		return;
	}

	if (AuthBaseUrl.IsEmpty())
	{
		PushLoginResult(false, TEXT("Authentication service is not configured."));
		return;
	}

	bLoginInFlight = true;

	TSharedPtr<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("username"), Username);
	Body->SetStringField(TEXT("email"), Email);
	Body->SetStringField(TEXT("password"), Password);

	FString BodyText;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyText);
	FJsonSerializer::Serialize(Body.ToSharedRef(), Writer);

	TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(AuthBaseUrl + TEXT("/auth/register"));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetContentAsString(BodyText);
	Request->OnProcessRequestComplete().BindUObject(this, &UMMOGameInstance::OnRegisterResponse);
	Request->ProcessRequest();
}

void UMMOGameInstance::OnRegisterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected)
{
	bLoginInFlight = false;

	if (!bConnected || !Response.IsValid())
	{
		CompleteLogin(false, NSLOCTEXT("MMOLogin", "AuthUnreachable", "Could not reach the authentication server."));
		return;
	}

	TSharedPtr<FJsonObject> Json;
	const bool bParsed = FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Json);

	if (Response->GetResponseCode() / 100 == 2 && bParsed)
	{
		AccessToken = Json->GetStringField(TEXT("accessToken"));
		RefreshToken = Json->GetStringField(TEXT("refreshToken"));
		CompleteLogin(true, FText::GetEmpty());
		return;
	}

	FString Message = FString::Printf(TEXT("Registration failed (%d)."), Response->GetResponseCode());
	if (bParsed)
	{
		const TSharedPtr<FJsonValue> MsgValue = Json->TryGetField(TEXT("message"));
		if (MsgValue.IsValid())
		{
			if (MsgValue->Type == EJson::String)
			{
				Message = MsgValue->AsString();
			}
			else if (MsgValue->Type == EJson::Array && MsgValue->AsArray().Num() > 0)
			{
				Message = MsgValue->AsArray()[0]->AsString();
			}
		}
	}
	CompleteLogin(false, FText::FromString(Message));
}

void UMMOGameInstance::CompleteLogin(bool bSucceeded, const FText& FailureMessage)
{
	bLoginInFlight = false;

	if (!bSucceeded)
	{
		PushLoginResult(false, FailureMessage.ToString());
		return;
	}

	PushLoginResult(true, FString());

	// After a successful login we fetch the account's characters and let the
	// page render a character-select screen. The page then sends
	// "character.select" to trigger travel.
	FetchCharacters();
}

void UMMOGameInstance::ReturnToLogin(const FString& Message)
{
	Phase = TEXT("login");
	PushPhase();
	PushLoginResult(false, Message);
}

void UMMOGameInstance::FetchCharacters()
{
	if (AuthBaseUrl.IsEmpty() || AccessToken.IsEmpty())
	{
		// No backend — skip character select and go straight to the map.
		Phase = TEXT("game");
		PushPhase();
		TravelToGame();
		return;
	}

	TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(AuthBaseUrl + TEXT("/characters"));
	Request->SetVerb(TEXT("GET"));
	Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *AccessToken));
	Request->OnProcessRequestComplete().BindUObject(this, &UMMOGameInstance::OnCharactersResponse);
	Request->ProcessRequest();
}

void UMMOGameInstance::OnCharactersResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected)
{
	TArray<TSharedPtr<FJsonValue>> Characters;
	if (bConnected && Response.IsValid() && Response->GetResponseCode() / 100 == 2)
	{
		TSharedPtr<FJsonValue> Root;
		if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Root))
		{
			if (Root.IsValid() && Root->Type == EJson::Array)
			{
				Characters = Root->AsArray();
			}
			else if (TSharedPtr<FJsonObject> Json = Root->AsObject())
			{
				const TArray<TSharedPtr<FJsonValue>>* Arr;
				if (Json->TryGetArrayField(TEXT("characters"), Arr))
				{
					Characters = *Arr;
				}
			}
		}
	}

	Phase = TEXT("character-select");
	PushPhase();
	PushCharacters(Characters);
}

void UMMOGameInstance::CreateCharacter(const FString& Name, const FString& Job, const FString& SubJob)
{
	if (AuthBaseUrl.IsEmpty() || AccessToken.IsEmpty())
	{
		return;
	}

	const FString Realm = SelectedServerName.IsEmpty() ? TEXT("North America") : SelectedServerName;

	TSharedPtr<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("name"), Name);
	Body->SetStringField(TEXT("realm"), Realm);
	Body->SetStringField(TEXT("job"), Job);
	if (!SubJob.IsEmpty())
	{
		Body->SetStringField(TEXT("subJob"), SubJob);
	}

	FString BodyText;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyText);
	FJsonSerializer::Serialize(Body.ToSharedRef(), Writer);

	TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(AuthBaseUrl + TEXT("/characters"));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *AccessToken));
	Request->SetContentAsString(BodyText);
	Request->OnProcessRequestComplete().BindUObject(this, &UMMOGameInstance::OnCreateCharacterResponse);
	Request->ProcessRequest();
}

void UMMOGameInstance::OnCreateCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected)
{
	if (bConnected && Response.IsValid() && Response->GetResponseCode() / 100 == 2)
	{
		// Notify the page so it can clear the create form, then refresh the list.
		PushLoginResult(true, FString());
		FetchCharacters();
		return;
	}

	FString Message = FString::Printf(TEXT("Could not create character (%d)."), Response->GetResponseCode());
	if (Response.IsValid())
	{
		TSharedPtr<FJsonObject> Json;
		if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Json))
		{
			const TSharedPtr<FJsonValue> MsgValue = Json->TryGetField(TEXT("message"));
			if (MsgValue.IsValid() && MsgValue->Type == EJson::String)
			{
				Message = MsgValue->AsString();
			}
			else if (MsgValue.IsValid() && MsgValue->Type == EJson::Array && MsgValue->AsArray().Num() > 0)
			{
				Message = MsgValue->AsArray()[0]->AsString();
			}
		}
	}
	PushLoginResult(false, Message);
}

void UMMOGameInstance::SelectCharacter(const FString& CharacterId)
{
	SelectedCharacterId = CharacterId;
	Phase = TEXT("game");
	PushPhase();
	TravelToGame();
}

void UMMOGameInstance::TravelToGame()
{
	APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
	if (!PC)
	{
		UE_LOG(LogTemp, Error, TEXT("MMOGameInstance::TravelToGame: no local PlayerController"));
		return;
	}

	const bool bShouldSelfHost = bSelfHostMode || DefaultGameServerAddress.IsEmpty();

	if (bShouldSelfHost)
	{
		// Stay in the persistent world: the GameMode streams the play level
		// additively and promotes the world to a listen server, so the web HUD
		// and its CEF browser are never destroyed by map travel.
		UWorld* World = GetWorld();
		if (AMMOGameMode* GameMode = World ? World->GetAuthGameMode<AMMOGameMode>() : nullptr)
		{
			GameMode->EnterGame(PC, AccessToken, SelectedCharacterId,
				PostLoginMap.IsNull() ? FString() : PostLoginMap.GetLongPackageName());
			return;
		}

		// Fallback for a world whose GameMode can't stream levels.
		if (!PostLoginMap.IsNull())
		{
			FString Options = TEXT("?Listen");
			if (!AccessToken.IsEmpty())
			{
				Options += FString::Printf(TEXT("?Token=%s"), *AccessToken);
			}
			if (!SelectedCharacterId.IsEmpty())
			{
				Options += FString::Printf(TEXT("?CharacterId=%s"), *SelectedCharacterId);
			}
			UGameplayStatics::OpenLevel(this, FName(*PostLoginMap.GetLongPackageName()), true, Options);
		}
		return;
	}

	if (!DefaultGameServerAddress.IsEmpty())
	{
		FString URL = FString::Printf(TEXT("%s?Token=%s"), *DefaultGameServerAddress, *AccessToken);
		if (!SelectedCharacterId.IsEmpty())
		{
			URL += FString::Printf(TEXT("&CharacterId=%s"), *SelectedCharacterId);
		}
		PC->ClientTravel(*URL, TRAVEL_Absolute);
	}
	else if (!PostLoginMap.IsNull())
	{
		UGameplayStatics::OpenLevel(this, FName(*PostLoginMap.GetLongPackageName()));
	}
}

// -- servers -----------------------------------------------------------------

void UMMOGameInstance::FetchServers()
{
	if (bServersFetched || AuthBaseUrl.IsEmpty())
	{
		return;
	}
	bServersFetched = true;

	TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(AuthBaseUrl + TEXT("/auth/servers"));
	Request->SetVerb(TEXT("GET"));
	Request->OnProcessRequestComplete().BindUObject(this, &UMMOGameInstance::OnServersResponse);
	Request->ProcessRequest();
}

void UMMOGameInstance::OnServersResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected)
{
	if (!bConnected || !Response.IsValid() || Response->GetResponseCode() / 100 != 2)
	{
		bServersFetched = false; // allow retry on next world/hello
		return;
	}

	TSharedPtr<FJsonObject> Json;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Json))
	{
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* Servers;
	if (Json->TryGetArrayField(TEXT("servers"), Servers))
	{
		ServerNames.Empty();
		for (const TSharedPtr<FJsonValue>& V : *Servers)
		{
			ServerNames.Add(V->AsString());
		}
		PushServers();
	}
}

// -- page push helpers --------------------------------------------------------

void UMMOGameInstance::PushPhase()
{
	SendToWeb(FString::Printf(TEXT("{\"type\":\"phase\",\"phase\":\"%s\"}"), *Phase));
}

void UMMOGameInstance::PushServers()
{
	FetchServers();

	if (ServerNames.Num() == 0)
	{
		return;
	}

	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
	Json->SetStringField(TEXT("type"), TEXT("servers"));
	TArray<TSharedPtr<FJsonValue>> Arr;
	for (const FString& S : ServerNames)
	{
		Arr.Add(MakeShared<FJsonValueString>(S));
	}
	Json->SetArrayField(TEXT("servers"), Arr);

	FString Text;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);
	SendToWeb(Text);
}

void UMMOGameInstance::PushCharacters(const TArray<TSharedPtr<FJsonValue>>& Characters)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
	Json->SetStringField(TEXT("type"), TEXT("characters"));
	Json->SetArrayField(TEXT("characters"), Characters);

	FString Text;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);
	SendToWeb(Text);
}

void UMMOGameInstance::PushLoginResult(bool bOk, const FString& Message)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
	Json->SetStringField(TEXT("type"), TEXT("login.result"));
	Json->SetBoolField(TEXT("ok"), bOk);
	Json->SetStringField(TEXT("message"), Message);

	FString Text;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);
	SendToWeb(Text);
}

// -- player state push to HUD --------------------------------------------------

void UMMOGameInstance::TryPushAllPlayerState()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
	if (!PC)
	{
		return;
	}

	if (AMMOPlayerState* PS = PC->GetPlayerState<AMMOPlayerState>())
	{
		PushPlayerStateEvents(PS);
		World->GetTimerManager().ClearTimer(PushStateTimerHandle);
		return;
	}

	// Local PlayerState has not replicated yet; keep polling briefly.
	if (!PushStateTimerHandle.IsValid())
	{
		FTimerDelegate Delegate;
		Delegate.BindUObject(this, &UMMOGameInstance::TryPushAllPlayerState);
		World->GetTimerManager().SetTimer(PushStateTimerHandle, Delegate, 0.5f, true, 0.5f);
	}
}

static TArray<TSharedPtr<FJsonValue>> BuildStatsJson(const TArray<FMMOCharacterStat>& Stats)
{
	TArray<TSharedPtr<FJsonValue>> Arr;
	for (const FMMOCharacterStat& Stat : Stats)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("statKey"), Stat.StatKey);
		Obj->SetNumberField(TEXT("baseValue"), Stat.BaseValue);
		Obj->SetNumberField(TEXT("bonusValue"), Stat.BonusValue);
		Obj->SetNumberField(TEXT("currentValue"), Stat.CurrentValue);
		Arr.Add(MakeShared<FJsonValueObject>(Obj));
	}
	return Arr;
}

static TArray<TSharedPtr<FJsonValue>> BuildEquipmentJson(const TArray<FMMOEquippedItem>& Equipment)
{
	TArray<TSharedPtr<FJsonValue>> Arr;
	for (const FMMOEquippedItem& Item : Equipment)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("slotKey"), Item.SlotKey);
		Obj->SetStringField(TEXT("itemKey"), Item.ItemKey);
		Obj->SetStringField(TEXT("inventoryItemId"), Item.InventoryItemId);
		Obj->SetBoolField(TEXT("isVisible"), Item.bIsVisible);
		Arr.Add(MakeShared<FJsonValueObject>(Obj));
	}
	return Arr;
}

static TArray<TSharedPtr<FJsonValue>> BuildAbilitiesJson(const TArray<FMMOAbility>& Abilities)
{
	TArray<TSharedPtr<FJsonValue>> Arr;
	for (const FMMOAbility& Ability : Abilities)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("abilityKey"), Ability.AbilityKey);
		Obj->SetNumberField(TEXT("rank"), Ability.Rank);
		Obj->SetBoolField(TEXT("isUnlocked"), Ability.bIsUnlocked);
		Obj->SetStringField(TEXT("sourceJob"), Ability.SourceJob);
		Obj->SetStringField(TEXT("cooldownAt"), Ability.CooldownAt);
		Arr.Add(MakeShared<FJsonValueObject>(Obj));
	}
	return Arr;
}

static TArray<TSharedPtr<FJsonValue>> BuildHotbarJson(const TArray<FMMOHotbarSlot>& Hotbar)
{
	TArray<TSharedPtr<FJsonValue>> Arr;
	for (const FMMOHotbarSlot& Slot : Hotbar)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetNumberField(TEXT("slotId"), Slot.SlotId);
		Obj->SetStringField(TEXT("type"), Slot.Type);
		Obj->SetStringField(TEXT("abilityKey"), Slot.AbilityKey);
		Obj->SetStringField(TEXT("inventoryItemId"), Slot.InventoryItemId);
		Obj->SetStringField(TEXT("macroId"), Slot.MacroId);
		Arr.Add(MakeShared<FJsonValueObject>(Obj));
	}
	return Arr;
}

static TArray<TSharedPtr<FJsonValue>> BuildPropsJson(const TArray<FMMOCharacterProp>& Props)
{
	TArray<TSharedPtr<FJsonValue>> Arr;
	for (const FMMOCharacterProp& Prop : Props)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("propId"), Prop.PropId);
		Obj->SetStringField(TEXT("propKey"), Prop.PropKey);
		Obj->SetStringField(TEXT("inventoryItemId"), Prop.InventoryItemId);
		Obj->SetBoolField(TEXT("isMounted"), Prop.bIsMounted);
		Obj->SetStringField(TEXT("transform"), Prop.TransformJson);
		Arr.Add(MakeShared<FJsonValueObject>(Obj));
	}
	return Arr;
}

static TSharedPtr<FJsonValue> ParseJsonValue(const FString& Json)
{
	TSharedPtr<FJsonValue> Root;
	if (!Json.IsEmpty() && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Root))
	{
		return Root;
	}
	return MakeShared<FJsonValueArray>(TArray<TSharedPtr<FJsonValue>>());
}

void UMMOGameInstance::PushPlayerStateEvents(AMMOPlayerState* PlayerState)
{
	if (!PlayerState)
	{
		return;
	}

	const FMMOCharacterData& Data = PlayerState->CharacterData;

	// player.state — core identity + live arrays.
	{
		TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
		Root->SetStringField(TEXT("type"), TEXT("player.state"));

		TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetStringField(TEXT("characterId"), Data.CharacterId);
		Payload->SetStringField(TEXT("name"), Data.Name);
		Payload->SetStringField(TEXT("realm"), Data.Realm);
		Payload->SetStringField(TEXT("mainJob"), Data.MainJob);
		Payload->SetStringField(TEXT("subJob"), Data.SubJob);
		Payload->SetNumberField(TEXT("level"), Data.Level);
		Payload->SetArrayField(TEXT("stats"), BuildStatsJson(Data.Stats));
		Payload->SetArrayField(TEXT("equipment"), BuildEquipmentJson(Data.Equipment));
		Payload->SetArrayField(TEXT("abilities"), BuildAbilitiesJson(Data.Abilities));
		Payload->SetArrayField(TEXT("hotbar"), BuildHotbarJson(Data.Hotbar));
		Payload->SetArrayField(TEXT("props"), BuildPropsJson(Data.Props));
		Root->SetObjectField(TEXT("data"), Payload);

		FString Text;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
		FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
		SendToWeb(Text);
	}

	// inventory (passthrough backend JSON).
	{
		TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
		Root->SetStringField(TEXT("type"), TEXT("inventory"));
		Root->SetField(TEXT("data"), ParseJsonValue(PlayerState->InventoryJson));
		FString Text;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
		FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
		SendToWeb(Text);
	}

	// equipment (also available inside player.state, but sent explicitly for UI convenience).
	{
		TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
		Root->SetStringField(TEXT("type"), TEXT("equipment"));
		Root->SetArrayField(TEXT("data"), BuildEquipmentJson(Data.Equipment));
		FString Text;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
		FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
		SendToWeb(Text);
	}

	// abilities.
	{
		TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
		Root->SetStringField(TEXT("type"), TEXT("abilities"));
		Root->SetArrayField(TEXT("data"), BuildAbilitiesJson(Data.Abilities));
		FString Text;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
		FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
		SendToWeb(Text);
	}

	// hotbar.
	{
		TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
		Root->SetStringField(TEXT("type"), TEXT("hotbar"));
		Root->SetArrayField(TEXT("data"), BuildHotbarJson(Data.Hotbar));
		FString Text;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
		FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
		SendToWeb(Text);
	}

	// jobs (passthrough backend JSON).
	{
		TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
		Root->SetStringField(TEXT("type"), TEXT("jobs"));
		Root->SetField(TEXT("data"), ParseJsonValue(PlayerState->JobsJson));
		FString Text;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
		FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
		SendToWeb(Text);
	}

	// props.
	{
		TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
		Root->SetStringField(TEXT("type"), TEXT("props"));
		Root->SetArrayField(TEXT("data"), BuildPropsJson(Data.Props));
		FString Text;
		const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
		FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
		SendToWeb(Text);
	}
}
