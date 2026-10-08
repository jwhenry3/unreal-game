// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOGameMode.h"

#include "MMOGameInstance.h"

#include "Engine/EngineBaseTypes.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerStart.h"
#include "GameFramework/PlayerState.h"
#include "Framework/Application/SlateApplication.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/LevelStreamingDynamic.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

AMMOGameMode::AMMOGameMode()
{
	PlayerStateClass = AMMOPlayerState::StaticClass();
}

void AMMOGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);

	if (!DefaultPawnClassPath.IsNull())
	{
		if (UClass* PawnClass = DefaultPawnClassPath.TryLoadClass<APawn>())
		{
			DefaultPawnClass = PawnClass;
		}
	}
}

void AMMOGameMode::BeginPlay()
{
	Super::BeginPlay();

	if (HasAuthority())
	{
		LoadDefaultAdditiveLevels();
	}
}

void AMMOGameMode::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	// Best-effort save for any players still connected when the world ends.
	if (HasAuthority())
	{
		for (TWeakObjectPtr<APlayerController> WeakPlayer : PendingSavePlayers)
		{
			if (WeakPlayer.IsValid())
			{
				SaveCharacterState(WeakPlayer.Get(), FString());
			}
		}
		PendingSavePlayers.Empty();
	}

	Super::EndPlay(EndPlayReason);
}

void AMMOGameMode::LoadDefaultAdditiveLevels()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	for (const FSoftObjectPath& Path : DefaultAdditiveLevels)
	{
		if (Path.IsNull())
		{
			continue;
		}

		const FString LevelPath = Path.GetLongPackageName();
		bool bLoaded = false;
		ULevelStreamingDynamic* Stream = ULevelStreamingDynamic::LoadLevelInstance(World, LevelPath, FVector::ZeroVector, FRotator::ZeroRotator, bLoaded);
		if (Stream)
		{
			Stream->SetShouldBeLoaded(true);
			Stream->SetShouldBeVisible(true);
			UE_LOG(LogTemp, Log, TEXT("MMOGameMode: streaming additive level %s (success=%s)"), *LevelPath, bLoaded ? TEXT("true") : TEXT("false"));
		}
		else
		{
			UE_LOG(LogTemp, Error, TEXT("MMOGameMode: failed to create streaming instance for %s"), *LevelPath);
		}
	}
}

void AMMOGameMode::LoadAdditiveLevel(const FString& LevelPath)
{
	UWorld* World = GetWorld();
	if (!World || !HasAuthority() || LevelPath.IsEmpty())
	{
		return;
	}

	bool bLoaded = false;
	ULevelStreamingDynamic* Stream = ULevelStreamingDynamic::LoadLevelInstance(World, LevelPath, FVector::ZeroVector, FRotator::ZeroRotator, bLoaded);
	if (Stream)
	{
		Stream->SetShouldBeLoaded(true);
		Stream->SetShouldBeVisible(true);
	}
}

void AMMOGameMode::UnloadAdditiveLevel(const FString& LevelPath)
{
	UWorld* World = GetWorld();
	if (!World || !HasAuthority())
	{
		return;
	}

	for (ULevelStreaming* Stream : World->GetStreamingLevels())
	{
		if (Stream && Stream->GetWorldAssetPackageName().Equals(LevelPath, ESearchCase::IgnoreCase))
		{
			Stream->SetShouldBeLoaded(false);
			Stream->SetShouldBeVisible(false);
			break;
		}
	}
}

void AMMOGameMode::PreLogin(const FString& Options, const FString& Address, const FUniqueNetIdRepl& UniqueId, FString& ErrorMessage)
{
	Super::PreLogin(Options, Address, UniqueId, ErrorMessage);
	if (!ErrorMessage.IsEmpty())
	{
		return;
	}

	const FString Token = UGameplayStatics::ParseOption(Options, TEXT("Token"));
	const FString CharacterId = UGameplayStatics::ParseOption(Options, TEXT("CharacterId"));

	if (Token.IsEmpty())
	{
		if (!bAllowDevLoginWithoutToken)
		{
			ErrorMessage = TEXT("Missing authentication token.");
			return;
		}
		// Dev/PIE self-host login: allow the connection but still track it.
		PendingAuths.Add(Address, FPendingAuth{ FString(), CharacterId });
		return;
	}

	PendingAuths.Add(Address, FPendingAuth{ Token, CharacterId });
}

void AMMOGameMode::PostLogin(APlayerController* NewPlayer)
{
	Super::PostLogin(NewPlayer);

	FString Address;
	if (NewPlayer && NewPlayer->Player)
	{
		Address = NewPlayer->GetPlayerNetworkAddress();
	}

	FPendingAuth Pending;
	if (NewPlayer && NewPlayer->GetNetConnection() == nullptr)
	{
		// The listen-server host (and standalone players) never pass through
		// PreLogin — that only runs for remote net connections — so there is no
		// PendingAuths entry. Their token/character arrive in the server's own
		// travel options (e.g. "?Listen?Token=...?CharacterId=...") instead.
		Pending.AccessToken = UGameplayStatics::ParseOption(OptionsString, TEXT("Token"));
		Pending.CharacterId = UGameplayStatics::ParseOption(OptionsString, TEXT("CharacterId"));
	}
	else if (!PendingAuths.RemoveAndCopyValue(Address, Pending))
	{
		if (NewPlayer)
		{
			NewPlayer->ClientReturnToMainMenuWithTextReason(FText::FromString(TEXT("Authentication handshake missing.")));
		}
		return;
	}

	// Track this player so we can save state on logout/world end.
	PendingSavePlayers.AddUnique(NewPlayer);

	if (Pending.AccessToken.IsEmpty())
	{
		if (!bAllowDevLoginWithoutToken)
		{
			if (NewPlayer)
			{
				NewPlayer->ClientReturnToMainMenuWithTextReason(FText::FromString(TEXT("Missing authentication token.")));
			}
			return;
		}
		if (bWaitForEnterGame && NewPlayer->GetNetConnection() == nullptr)
		{
			// Host player on the persistent world — auth and spawning happen in
			// EnterGame(), not here; stay a spectator until then.
			return;
		}
		// Dev/PIE self-host login with no backend token. Try to load persisted
		// state from the backend if reachable; otherwise spawn with defaults.
		UE_LOG(LogTemp, Log, TEXT("MMOGameMode: dev login for %s, loading character state."), *Address);
		LoadCharacterData(NewPlayer, Pending.CharacterId, true);
		if (bWaitForEnterGame)
		{
			QueuePlayerForSpawn(NewPlayer);
		}
		return;
	}

	RequestTokenVerification(NewPlayer, Pending.AccessToken, Pending.CharacterId);
}

void AMMOGameMode::RequestTokenVerification(TWeakObjectPtr<APlayerController> Player, const FString& AccessToken, const FString& CharacterId)
{
	TSharedPtr<FJsonObject> Body = MakeShared<FJsonObject>();
	Body->SetStringField(TEXT("accessToken"), AccessToken);

	FString BodyText;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyText);
	FJsonSerializer::Serialize(Body.ToSharedRef(), Writer);

	TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(BackendBaseUrl + TEXT("/internal/auth/verify"));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	if (!ServiceKey.IsEmpty())
	{
		Request->SetHeader(TEXT("x-service-key"), ServiceKey);
	}
	Request->SetContentAsString(BodyText);

	Request->OnProcessRequestComplete().BindLambda([this, Player, CharacterId](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
	{
		OnVerifyTokenResponse(Req, Res, bConnected, Player, CharacterId);
	});
	Request->ProcessRequest();
}

void AMMOGameMode::Logout(AController* Exiting)
{
	if (HasAuthority() && Exiting)
	{
		if (APlayerController* PC = Cast<APlayerController>(Exiting))
		{
			SaveCharacterState(PC, FString());
			PendingSavePlayers.Remove(PC);
		}
	}

	Super::Logout(Exiting);
}

void AMMOGameMode::OnVerifyTokenResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected, TWeakObjectPtr<APlayerController> Player, FString CharacterId)
{
	if (!Player.IsValid())
	{
		return;
	}

	TSharedPtr<FJsonObject> Json;
	const bool bParsed = bConnected && Response.IsValid() && Response->GetResponseCode() / 100 == 2
		&& FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Json);

	if (!bParsed)
	{
		// For the persistent-world host, traveling to the default map would tear
		// down the web HUD — report the failure to the page instead.
		if (Player->GetNetConnection() == nullptr && bWaitForEnterGame)
		{
			ReportEnterFailure(Player.Get(), TEXT("Authentication verification failed."));
		}
		else
		{
			Player->ClientReturnToMainMenuWithTextReason(FText::FromString(TEXT("Authentication verification failed.")));
		}
		return;
	}

	UE_LOG(LogTemp, Log, TEXT("MMOGameMode: verified token for %s"), *Player->GetPlayerNetworkAddress());

	// If the travel options didn't include a character id, try to read one from
	// the verify response so data loading can still proceed.
	if (CharacterId.IsEmpty() && Json.IsValid())
	{
		Json->TryGetStringField(TEXT("characterId"), CharacterId);
	}

	LoadCharacterData(Player, CharacterId, false);

	if (bWaitForEnterGame)
	{
		QueuePlayerForSpawn(Player.Get());
	}
}

// -- persistent-world enter-game flow -----------------------------------------

bool AMMOGameMode::MustSpectate_Implementation(APlayerController* NewPlayerController) const
{
	if (bWaitForEnterGame && !bGameStarted)
	{
		return true;
	}
	return Super::MustSpectate_Implementation(NewPlayerController);
}

void AMMOGameMode::EnterGame(APlayerController* PC, const FString& AccessToken, const FString& CharacterId, const FString& LevelPath)
{
	if (!HasAuthority() || !PC || bGameStarted)
	{
		return;
	}

	if (AccessToken.IsEmpty() && !bAllowDevLoginWithoutToken)
	{
		ReportEnterFailure(PC, TEXT("Missing authentication token."));
		return;
	}

	bGameStarted = true;
	PendingSavePlayers.AddUnique(PC);

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Promote this world to a listen server — replaces the old "?Listen" travel
	// URL so remote clients can still join the session.
	FURL ListenURL(nullptr, TEXT(""), TRAVEL_Absolute);
	if (World->Listen(ListenURL))
	{
		UE_LOG(LogTemp, Log, TEXT("MMOGameMode: world now listening for remote clients"));
	}

	// Stream the play level in additively — the world never travels, so the
	// persistent web HUD / CEF browser survives the login->game transition.
	if (!LevelPath.IsEmpty())
	{
		bool bLoaded = false;
		ULevelStreamingDynamic* Stream = ULevelStreamingDynamic::LoadLevelInstance(World, LevelPath, FVector::ZeroVector, FRotator::ZeroRotator, bLoaded);
		if (!Stream)
		{
			bGameStarted = false;
			ReportEnterFailure(PC, FString::Printf(TEXT("Could not load level %s."), *LevelPath));
			return;
		}
		Stream->SetShouldBeLoaded(true);
		Stream->SetShouldBeVisible(true);
		Stream->OnLevelLoaded.AddDynamic(this, &AMMOGameMode::OnGameLevelLoaded);
		UE_LOG(LogTemp, Log, TEXT("MMOGameMode: streaming game level %s"), *LevelPath);
		if (Stream->GetLoadedLevel())
		{
			OnGameLevelLoaded();
		}
	}
	else
	{
		bGameLevelLoaded = true;
	}

	if (AccessToken.IsEmpty())
	{
		LoadCharacterData(PC, CharacterId, true);
		QueuePlayerForSpawn(PC);
	}
	else
	{
		RequestTokenVerification(PC, AccessToken, CharacterId);
	}
}

void AMMOGameMode::OnGameLevelLoaded()
{
	UE_LOG(LogTemp, Log, TEXT("MMOGameMode: game level loaded"));
	bGameLevelLoaded = true;

	for (const TWeakObjectPtr<APlayerController>& WeakPC : PlayersAwaitingSpawn)
	{
		if (WeakPC.IsValid())
		{
			SpawnPlayerNow(WeakPC.Get());
		}
	}
	PlayersAwaitingSpawn.Empty();
}

void AMMOGameMode::QueuePlayerForSpawn(APlayerController* PC)
{
	if (!PC || SpawnedPlayers.Contains(PC))
	{
		return;
	}
	if (bGameLevelLoaded)
	{
		SpawnPlayerNow(PC);
		return;
	}
	PlayersAwaitingSpawn.AddUnique(PC);
}

void AMMOGameMode::SpawnPlayerNow(APlayerController* PC)
{
	if (!PC)
	{
		return;
	}

	SpawnedPlayers.AddUnique(PC);
	ClearLoginBackdrop();

	// The player has been a spectator since login — hand them a real pawn at a
	// PlayerStart inside the streamed level now.
	if (PC->PlayerState)
	{
		PC->PlayerState->SetIsOnlyASpectator(false);
	}
	if (APawn* OldPawn = PC->GetPawnOrSpectator())
	{
		OldPawn->Destroy();
	}
	// RestartPlayer would consider the login map's own PlayerStart — pick a
	// start inside the streamed game level so the pawn lands on real floor.
	if (APlayerStart* Start = FindGamePlayerStart())
	{
		RestartPlayerAtPlayerStart(PC, Start);
	}
	else
	{
		RestartPlayer(PC);
	}

	// Swap out of the login UI-only input mode; the HUD still gets the pointer,
	// but game input flows too.
	if (PC->IsLocalPlayerController())
	{
		PC->SetInputMode(FInputModeGameAndUI());
		PC->SetShowMouseCursor(true);
		// The web browser kept keyboard focus after the login click — give key
		// events back to the game or movement keys go to the page.
		FSlateApplication::Get().SetAllUserFocusToGameViewport();
	}

	UE_LOG(LogTemp, Log, TEXT("MMOGameMode: %s entered game (pawn=%s, state=%s)"),
		*PC->GetName(),
		PC->GetPawn() ? *PC->GetPawn()->GetName() : TEXT("NONE"),
		*PC->GetStateName().ToString());
}

APlayerStart* AMMOGameMode::FindGamePlayerStart() const
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return nullptr;
	}

	// Prefer a start that lives in a streamed level, not the persistent
	// (login) level's own PlayerStart.
	for (TActorIterator<APlayerStart> It(World); It; ++It)
	{
		if (It->GetLevel() && It->GetLevel() != World->PersistentLevel)
		{
			return *It;
		}
	}
	// Fallback: any PlayerStart in the world.
	for (TActorIterator<APlayerStart> It(World); It; ++It)
	{
		return *It;
	}
	return nullptr;
}

void AMMOGameMode::ClearLoginBackdrop()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	TArray<AActor*> Tagged;
	UGameplayStatics::GetAllActorsWithTag(World, TEXT("LoginBackdrop"), Tagged);
	for (AActor* Actor : Tagged)
	{
		if (Actor)
		{
			Actor->Destroy();
		}
	}
}

void AMMOGameMode::ReportEnterFailure(APlayerController* PC, const FString& Message)
{
	UE_LOG(LogTemp, Warning, TEXT("MMOGameMode: enter game failed: %s"), *Message);
	bGameStarted = false;
	PlayersAwaitingSpawn.Remove(PC);
	if (UMMOGameInstance* GI = Cast<UMMOGameInstance>(GetGameInstance()))
	{
		GI->ReturnToLogin(Message);
	}
}

void AMMOGameMode::LoadCharacterData(TWeakObjectPtr<APlayerController> Player, const FString& CharacterId, bool bDevFallback)
{
	if (!Player.IsValid())
	{
		return;
	}

	if (CharacterId.IsEmpty() && bDevFallback)
	{
		// Dev login with no selected character — spawn with a default block.
		CreateDefaultPlayerState(Player.Get(), CharacterId);
		return;
	}

	TSharedPtr<FPendingCharacterLoad> Context = MakeShared<FPendingCharacterLoad>();
	Context->Player = Player;
	Context->CharacterId = CharacterId;
	Context->bDevFallback = bDevFallback;
	ContinueLoadCharacter(Context);
}

void AMMOGameMode::ContinueLoadCharacter(const TSharedPtr<FPendingCharacterLoad>& Context)
{
	if (!Context.IsValid() || !Context->Player.IsValid())
	{
		return;
	}

	APlayerController* Player = Context->Player.Get();
	const FString Id = Context->CharacterId;

	switch (Context->Step)
	{
	case 0:
	{
		TSharedRef<IHttpRequest> Request = MakeInternalRequest(TEXT("GET"), FString::Printf(TEXT("/internal/characters/%s"), *Id));
		Request->OnProcessRequestComplete().BindLambda([this, Context](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
		{
			if (!bConnected || !Res.IsValid() || Res->GetResponseCode() / 100 != 2)
			{
				UE_LOG(LogTemp, Warning, TEXT("MMOGameMode: failed to load character %s (connected=%d, code=%d)."),
					*Context->CharacterId, bConnected ? 1 : 0, Res.IsValid() ? Res->GetResponseCode() : -1);
				if (Context->bDevFallback)
				{
					CreateDefaultPlayerState(Context->Player.Get(), Context->CharacterId);
				}
				else if (Context->Player.IsValid())
				{
					Context->Player->ClientReturnToMainMenuWithTextReason(FText::FromString(TEXT("Could not load character data.")));
				}
				return;
			}

			TSharedPtr<FJsonObject> Json;
			if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Res->GetContentAsString()), Json) && Json.IsValid())
			{
				Context->Data.CharacterId = Json->GetStringField(TEXT("id"));
				if (Context->Data.CharacterId.IsEmpty())
				{
					Context->Data.CharacterId = Json->GetStringField(TEXT("characterId"));
				}
				Context->Data.Name = Json->GetStringField(TEXT("name"));
				Context->Data.Realm = Json->GetStringField(TEXT("realm"));
				Context->Data.MainJob = Json->GetStringField(TEXT("mainJob"));
				if (Context->Data.MainJob.IsEmpty())
				{
					Context->Data.MainJob = Json->GetStringField(TEXT("main_job"));
				}
				Context->Data.SubJob = Json->GetStringField(TEXT("subJob"));
				if (Context->Data.SubJob.IsEmpty())
				{
					Context->Data.SubJob = Json->GetStringField(TEXT("sub_job"));
				}
			}

			Context->Step = 1;
			ContinueLoadCharacter(Context);
		});
		Request->ProcessRequest();
		return;
	}
	case 1:
	{
		TSharedRef<IHttpRequest> Request = MakeInternalRequest(TEXT("GET"), FString::Printf(TEXT("/internal/characters/%s/jobs"), *Id));
		Request->OnProcessRequestComplete().BindLambda([this, Context](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
		{
			if (bConnected && Res.IsValid() && Res->GetResponseCode() / 100 == 2)
			{
				Context->JobsJson = Res->GetContentAsString();

				TSharedPtr<FJsonValue> Root;
				if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Context->JobsJson), Root))
				{
					const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
					if (Root->TryGetArray(Arr))
					{
						for (const TSharedPtr<FJsonValue>& V : *Arr)
						{
							if (TSharedPtr<FJsonObject> Obj = V->AsObject())
							{
								FString JobKey = Obj->GetStringField(TEXT("jobKey"));
								if (JobKey.IsEmpty())
								{
									JobKey = Obj->GetStringField(TEXT("job_key"));
								}
								if (JobKey == Context->Data.MainJob)
								{
									int32 Level = 1;
									Obj->TryGetNumberField(TEXT("level"), Level);
									Context->Data.Level = Level;
									break;
								}
							}
						}
					}
				}
			}
			Context->Step = 2;
			ContinueLoadCharacter(Context);
		});
		Request->ProcessRequest();
		return;
	}
	case 2:
	{
		TSharedRef<IHttpRequest> Request = MakeInternalRequest(TEXT("GET"), FString::Printf(TEXT("/internal/characters/%s/inventory"), *Id));
		Request->OnProcessRequestComplete().BindLambda([this, Context](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
		{
			if (bConnected && Res.IsValid() && Res->GetResponseCode() / 100 == 2)
			{
				Context->InventoryJson = Res->GetContentAsString();
			}
			Context->Step = 3;
			ContinueLoadCharacter(Context);
		});
		Request->ProcessRequest();
		return;
	}
	case 3:
	{
		TSharedRef<IHttpRequest> Request = MakeInternalRequest(TEXT("GET"), FString::Printf(TEXT("/internal/characters/%s/stats"), *Id));
		Request->OnProcessRequestComplete().BindLambda([this, Context](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
		{
			if (bConnected && Res.IsValid() && Res->GetResponseCode() / 100 == 2)
			{
				ParseStats(Res->GetContentAsString(), Context->Data.Stats);
			}
			Context->Step = 4;
			ContinueLoadCharacter(Context);
		});
		Request->ProcessRequest();
		return;
	}
	case 4:
	{
		TSharedRef<IHttpRequest> Request = MakeInternalRequest(TEXT("GET"), FString::Printf(TEXT("/internal/characters/%s/equipment"), *Id));
		Request->OnProcessRequestComplete().BindLambda([this, Context](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
		{
			if (bConnected && Res.IsValid() && Res->GetResponseCode() / 100 == 2)
			{
				ParseEquipment(Res->GetContentAsString(), Context->Data.Equipment);
			}
			Context->Step = 5;
			ContinueLoadCharacter(Context);
		});
		Request->ProcessRequest();
		return;
	}
	case 5:
	{
		TSharedRef<IHttpRequest> Request = MakeInternalRequest(TEXT("GET"), FString::Printf(TEXT("/internal/characters/%s/abilities"), *Id));
		Request->OnProcessRequestComplete().BindLambda([this, Context](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
		{
			if (bConnected && Res.IsValid() && Res->GetResponseCode() / 100 == 2)
			{
				ParseAbilities(Res->GetContentAsString(), Context->Data.Abilities);
			}
			Context->Step = 6;
			ContinueLoadCharacter(Context);
		});
		Request->ProcessRequest();
		return;
	}
	case 6:
	{
		TSharedRef<IHttpRequest> Request = MakeInternalRequest(TEXT("GET"), FString::Printf(TEXT("/internal/characters/%s/hotbar"), *Id));
		Request->OnProcessRequestComplete().BindLambda([this, Context](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
		{
			if (bConnected && Res.IsValid() && Res->GetResponseCode() / 100 == 2)
			{
				ParseHotbar(Res->GetContentAsString(), Context->Data.Hotbar);
			}
			Context->Step = 7;
			ContinueLoadCharacter(Context);
		});
		Request->ProcessRequest();
		return;
	}
	case 7:
	{
		TSharedRef<IHttpRequest> Request = MakeInternalRequest(TEXT("GET"), FString::Printf(TEXT("/internal/characters/%s/props"), *Id));
		Request->OnProcessRequestComplete().BindLambda([this, Context](FHttpRequestPtr Req, FHttpResponsePtr Res, bool bConnected)
		{
			if (bConnected && Res.IsValid() && Res->GetResponseCode() / 100 == 2)
			{
				ParseProps(Res->GetContentAsString(), Context->Data.Props);
			}
			ApplyLoadedCharacterData(Context);
		});
		Request->ProcessRequest();
		return;
	}
	default:
		ApplyLoadedCharacterData(Context);
		return;
	}
}

void AMMOGameMode::ApplyLoadedCharacterData(const TSharedPtr<FPendingCharacterLoad>& Context)
{
	if (!Context.IsValid() || !Context->Player.IsValid())
	{
		return;
	}

	APlayerController* Player = Context->Player.Get();
	if (AMMOPlayerState* PS = Cast<AMMOPlayerState>(Player->PlayerState))
	{
		PS->SetCharacterData(Context->Data);
		PS->SetJobsJson(Context->JobsJson);
		PS->SetInventoryJson(Context->InventoryJson);
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("MMOGameMode: PlayerState is not AMMOPlayerState for %s"), *Player->GetName());
	}

	UE_LOG(LogTemp, Log, TEXT("MMOGameMode: applied character data for %s (level=%d, stats=%d, equipment=%d, abilities=%d, hotbar=%d, props=%d)"),
		*Context->Data.Name, Context->Data.Level, Context->Data.Stats.Num(), Context->Data.Equipment.Num(),
		Context->Data.Abilities.Num(), Context->Data.Hotbar.Num(), Context->Data.Props.Num());
}

void AMMOGameMode::CreateDefaultPlayerState(APlayerController* Player, const FString& CharacterId)
{
	if (!Player)
	{
		return;
	}

	FMMOCharacterData Data;
	Data.CharacterId = CharacterId.IsEmpty() ? TEXT("dev") : CharacterId;
	Data.Name = TEXT("Developer");
	Data.Realm = TEXT("Local");
	Data.MainJob = TEXT("Adventurer");
	Data.SubJob = TEXT("");
	Data.Level = 1;

	// Minimal starter stats so gameplay/HUD have something to show.
	FMMOCharacterStat HP, MP;
	HP.StatKey = TEXT("hp");
	HP.BaseValue = 100.f;
	HP.CurrentValue = 100.f;
	MP.StatKey = TEXT("mp");
	MP.BaseValue = 50.f;
	MP.CurrentValue = 50.f;
	Data.Stats.Add(HP);
	Data.Stats.Add(MP);

	if (AMMOPlayerState* PS = Cast<AMMOPlayerState>(Player->PlayerState))
	{
		PS->SetCharacterData(Data);
		PS->SetJobsJson(TEXT("[]"));
		PS->SetInventoryJson(TEXT("[]"));
	}

	UE_LOG(LogTemp, Log, TEXT("MMOGameMode: created default PlayerState for dev login."));
}

void AMMOGameMode::SaveCharacterState(APlayerController* Player, const FString& CharacterId)
{
	if (!Player || !HasAuthority() || BackendBaseUrl.IsEmpty() || ServiceKey.IsEmpty())
	{
		return;
	}

	AMMOPlayerState* PS = Cast<AMMOPlayerState>(Player->PlayerState);
	if (!PS)
	{
		return;
	}

	const FString Id = CharacterId.IsEmpty() ? PS->CharacterData.CharacterId : CharacterId;
	if (Id.IsEmpty())
	{
		return;
	}

	// Build state payload with current map and position.
	TSharedPtr<FJsonObject> StateBody = MakeShared<FJsonObject>();
	StateBody->SetStringField(TEXT("mapName"), GetWorld() ? GetWorld()->GetMapName() : FString());

	FString PositionStr = TEXT("null");
	if (APawn* Pawn = Player->GetPawn())
	{
		const FVector Loc = Pawn->GetActorLocation();
		TSharedPtr<FJsonObject> Pos = MakeShared<FJsonObject>();
		Pos->SetNumberField(TEXT("x"), Loc.X);
		Pos->SetNumberField(TEXT("y"), Loc.Y);
		Pos->SetNumberField(TEXT("z"), Loc.Z);
		StateBody->SetObjectField(TEXT("position"), Pos);
	}

	TSharedPtr<FJsonObject> StateBlob = MakeShared<FJsonObject>();
	StateBlob->SetNumberField(TEXT("level"), PS->CharacterData.Level);
	StateBlob->SetStringField(TEXT("mainJob"), PS->CharacterData.MainJob);
	StateBlob->SetStringField(TEXT("subJob"), PS->CharacterData.SubJob);
	StateBody->SetObjectField(TEXT("state"), StateBlob);

	FString StateJson;
	const TSharedRef<TJsonWriter<>> StateWriter = TJsonWriterFactory<>::Create(&StateJson);
	FJsonSerializer::Serialize(StateBody.ToSharedRef(), StateWriter);

	TSharedRef<IHttpRequest> StateRequest = MakeInternalRequest(TEXT("PATCH"), FString::Printf(TEXT("/internal/characters/%s/state"), *Id));
	StateRequest->SetContentAsString(StateJson);
	StateRequest->ProcessRequest();

	// Build stats update payload.
	TSharedPtr<FJsonObject> StatsBody = MakeShared<FJsonObject>();
	TArray<TSharedPtr<FJsonValue>> StatsArr;
	for (const FMMOCharacterStat& Stat : PS->CharacterData.Stats)
	{
		TSharedPtr<FJsonObject> S = MakeShared<FJsonObject>();
		S->SetStringField(TEXT("statKey"), Stat.StatKey);
		S->SetNumberField(TEXT("baseValue"), Stat.BaseValue);
		S->SetNumberField(TEXT("bonusValue"), Stat.BonusValue);
		S->SetNumberField(TEXT("currentValue"), Stat.CurrentValue);
		StatsArr.Add(MakeShared<FJsonValueObject>(S));
	}
	StatsBody->SetArrayField(TEXT("stats"), StatsArr);

	FString StatsJson;
	const TSharedRef<TJsonWriter<>> StatsWriter = TJsonWriterFactory<>::Create(&StatsJson);
	FJsonSerializer::Serialize(StatsBody.ToSharedRef(), StatsWriter);

	TSharedRef<IHttpRequest> StatsRequest = MakeInternalRequest(TEXT("PATCH"), FString::Printf(TEXT("/internal/characters/%s/stats"), *Id));
	StatsRequest->SetContentAsString(StatsJson);
	StatsRequest->ProcessRequest();

	UE_LOG(LogTemp, Log, TEXT("MMOGameMode: saved character state for %s"), *Id);
}

TSharedRef<IHttpRequest> AMMOGameMode::MakeInternalRequest(const FString& Verb, const FString& Path)
{
	TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(BackendBaseUrl + Path);
	Request->SetVerb(Verb);
	if (!ServiceKey.IsEmpty())
	{
		Request->SetHeader(TEXT("x-service-key"), ServiceKey);
	}
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	return Request;
}

void AMMOGameMode::ParseStats(const FString& Body, TArray<FMMOCharacterStat>& OutStats)
{
	TSharedPtr<FJsonValue> Root;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Body), Root))
	{
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
	if (!Root->TryGetArray(Arr))
	{
		return;
	}

	for (const TSharedPtr<FJsonValue>& V : *Arr)
	{
		TSharedPtr<FJsonObject> Obj = V->AsObject();
		if (!Obj.IsValid())
		{
			continue;
		}

		FMMOCharacterStat Stat;
		Stat.StatKey = Obj->GetStringField(TEXT("statKey"));
		if (Stat.StatKey.IsEmpty())
		{
			Stat.StatKey = Obj->GetStringField(TEXT("stat_key"));
		}
		Obj->TryGetNumberField(TEXT("baseValue"), Stat.BaseValue);
		if (!Obj->HasField(TEXT("baseValue")))
		{
			Obj->TryGetNumberField(TEXT("base_value"), Stat.BaseValue);
		}
		Obj->TryGetNumberField(TEXT("bonusValue"), Stat.BonusValue);
		if (!Obj->HasField(TEXT("bonusValue")))
		{
			Obj->TryGetNumberField(TEXT("bonus_value"), Stat.BonusValue);
		}
		Obj->TryGetNumberField(TEXT("currentValue"), Stat.CurrentValue);
		if (!Obj->HasField(TEXT("currentValue")))
		{
			Obj->TryGetNumberField(TEXT("current_value"), Stat.CurrentValue);
		}
		OutStats.Add(Stat);
	}
}

void AMMOGameMode::ParseEquipment(const FString& Body, TArray<FMMOEquippedItem>& OutEquipment)
{
	TSharedPtr<FJsonValue> Root;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Body), Root))
	{
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
	if (!Root->TryGetArray(Arr))
	{
		return;
	}

	for (const TSharedPtr<FJsonValue>& V : *Arr)
	{
		TSharedPtr<FJsonObject> Obj = V->AsObject();
		if (!Obj.IsValid())
		{
			continue;
		}

		FMMOEquippedItem Item;
		Item.SlotKey = Obj->GetStringField(TEXT("slotKey"));
		if (Item.SlotKey.IsEmpty())
		{
			Item.SlotKey = Obj->GetStringField(TEXT("slot_key"));
		}
		Item.ItemKey = Obj->GetStringField(TEXT("itemKey"));
		if (Item.ItemKey.IsEmpty())
		{
			Item.ItemKey = Obj->GetStringField(TEXT("item_key"));
		}
		Item.InventoryItemId = Obj->GetStringField(TEXT("inventoryItemId"));
		if (Item.InventoryItemId.IsEmpty())
		{
			Item.InventoryItemId = Obj->GetStringField(TEXT("inventory_item_id"));
		}
		Obj->TryGetBoolField(TEXT("isVisible"), Item.bIsVisible);
		if (!Obj->HasField(TEXT("isVisible")))
		{
			Obj->TryGetBoolField(TEXT("is_visible"), Item.bIsVisible);
		}
		OutEquipment.Add(Item);
	}
}

void AMMOGameMode::ParseAbilities(const FString& Body, TArray<FMMOAbility>& OutAbilities)
{
	TSharedPtr<FJsonValue> Root;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Body), Root))
	{
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
	if (!Root->TryGetArray(Arr))
	{
		return;
	}

	for (const TSharedPtr<FJsonValue>& V : *Arr)
	{
		TSharedPtr<FJsonObject> Obj = V->AsObject();
		if (!Obj.IsValid())
		{
			continue;
		}

		FMMOAbility Ability;
		Ability.AbilityKey = Obj->GetStringField(TEXT("abilityKey"));
		if (Ability.AbilityKey.IsEmpty())
		{
			Ability.AbilityKey = Obj->GetStringField(TEXT("ability_key"));
		}
		Obj->TryGetNumberField(TEXT("rank"), Ability.Rank);
		Obj->TryGetBoolField(TEXT("isUnlocked"), Ability.bIsUnlocked);
		if (!Obj->HasField(TEXT("isUnlocked")))
		{
			Obj->TryGetBoolField(TEXT("is_unlocked"), Ability.bIsUnlocked);
		}
		Ability.SourceJob = Obj->GetStringField(TEXT("sourceJob"));
		if (Ability.SourceJob.IsEmpty())
		{
			Ability.SourceJob = Obj->GetStringField(TEXT("source_job"));
		}
		Ability.CooldownAt = Obj->GetStringField(TEXT("cooldownAt"));
		if (Ability.CooldownAt.IsEmpty())
		{
			Ability.CooldownAt = Obj->GetStringField(TEXT("cooldown_at"));
		}
		OutAbilities.Add(Ability);
	}
}

void AMMOGameMode::ParseHotbar(const FString& Body, TArray<FMMOHotbarSlot>& OutHotbar)
{
	TSharedPtr<FJsonValue> Root;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Body), Root))
	{
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
	if (Root->TryGetArray(Arr))
	{
		// hotbar is already an array of slots
	}
	else if (TSharedPtr<FJsonObject> Obj = Root->AsObject())
	{
		Obj->TryGetArrayField(TEXT("slots"), Arr);
	}

	if (!Arr)
	{
		return;
	}

	for (const TSharedPtr<FJsonValue>& V : *Arr)
	{
		TSharedPtr<FJsonObject> Obj = V->AsObject();
		if (!Obj.IsValid())
		{
			continue;
		}

		FMMOHotbarSlot Slot;
		Obj->TryGetNumberField(TEXT("slotId"), Slot.SlotId);
		if (!Obj->HasField(TEXT("slotId")))
		{
			Obj->TryGetNumberField(TEXT("slot_id"), Slot.SlotId);
		}
		Slot.Type = Obj->GetStringField(TEXT("type"));
		Slot.AbilityKey = Obj->GetStringField(TEXT("abilityKey"));
		if (Slot.AbilityKey.IsEmpty())
		{
			Slot.AbilityKey = Obj->GetStringField(TEXT("ability_key"));
		}
		Slot.InventoryItemId = Obj->GetStringField(TEXT("inventoryItemId"));
		if (Slot.InventoryItemId.IsEmpty())
		{
			Slot.InventoryItemId = Obj->GetStringField(TEXT("inventory_item_id"));
		}
		Slot.MacroId = Obj->GetStringField(TEXT("macroId"));
		if (Slot.MacroId.IsEmpty())
		{
			Slot.MacroId = Obj->GetStringField(TEXT("macro_id"));
		}
		OutHotbar.Add(Slot);
	}
}

void AMMOGameMode::ParseProps(const FString& Body, TArray<FMMOCharacterProp>& OutProps)
{
	TSharedPtr<FJsonValue> Root;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Body), Root))
	{
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
	if (!Root->TryGetArray(Arr))
	{
		return;
	}

	for (const TSharedPtr<FJsonValue>& V : *Arr)
	{
		TSharedPtr<FJsonObject> Obj = V->AsObject();
		if (!Obj.IsValid())
		{
			continue;
		}

		FMMOCharacterProp Prop;
		Prop.PropId = Obj->GetStringField(TEXT("propId"));
		if (Prop.PropId.IsEmpty())
		{
			Prop.PropId = Obj->GetStringField(TEXT("id"));
		}
		Prop.PropKey = Obj->GetStringField(TEXT("propKey"));
		if (Prop.PropKey.IsEmpty())
		{
			Prop.PropKey = Obj->GetStringField(TEXT("prop_key"));
		}
		Prop.InventoryItemId = Obj->GetStringField(TEXT("inventoryItemId"));
		if (Prop.InventoryItemId.IsEmpty())
		{
			Prop.InventoryItemId = Obj->GetStringField(TEXT("inventory_item_id"));
		}
		Obj->TryGetBoolField(TEXT("isMounted"), Prop.bIsMounted);
		if (!Obj->HasField(TEXT("isMounted")))
		{
			Obj->TryGetBoolField(TEXT("is_mounted"), Prop.bIsMounted);
		}
		const TSharedPtr<FJsonObject>* TransformObjPtr = nullptr;
		if (Obj->TryGetObjectField(TEXT("transform"), TransformObjPtr) && TransformObjPtr)
		{
			FString TransformJson;
			const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&TransformJson);
			FJsonSerializer::Serialize(TransformObjPtr->ToSharedRef(), Writer);
			Prop.TransformJson = TransformJson;
		}
		OutProps.Add(Prop);
	}
}
