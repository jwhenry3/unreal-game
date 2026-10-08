// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Interfaces/IHttpRequest.h"
#include "MMOPlayerState.h"
#include "MMOGameMode.generated.h"

class APlayerStart;

/**
 *  GameMode used by the playable MMO map. Validates the access token passed in
 *  travel options against the backend's internal auth verify endpoint before
 *  letting the player spawn.
 */
UCLASS(Config = "Game")
class AMMOGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:

	AMMOGameMode();

	/** Base URL of the auth backend for the internal verify endpoint. */
	UPROPERTY(EditAnywhere, Config, Category = "MMO")
	FString BackendBaseUrl = TEXT("http://localhost:3100");

	/** Service key used to call /internal/* endpoints. Do not ship to clients. */
	UPROPERTY(EditAnywhere, Config, Category = "MMO")
	FString ServiceKey;

	/** If true, allow PIE/standalone clients to connect without a backend token.
	 *  This is only for local development; keep disabled for production.
	 */
	UPROPERTY(EditAnywhere, Config, Category = "MMO")
	bool bAllowDevLoginWithoutToken = true;

	/** Blueprint pawn class to spawn for connected players. */
	UPROPERTY(EditAnywhere, Config, Category = "MMO")
	FSoftClassPath DefaultPawnClassPath;

	/** Sub-levels to stream in additively once the server starts.
	 *  Keep these lightweight and free of conflicting GameMode/PlayerStart overrides.
	 */
	UPROPERTY(EditAnywhere, Config, Category = "MMO|Streaming")
	TArray<FSoftObjectPath> DefaultAdditiveLevels;

	/** Persistent-world entry point used by the self-host flow: promotes the
	 *  world to a listen server, streams LevelPath in additively, authenticates,
	 *  then spawns the player — no map travel, so the web HUD survives. */
	void EnterGame(APlayerController* PC, const FString& AccessToken, const FString& CharacterId, const FString& LevelPath);

protected:

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual void PreLogin(const FString& Options, const FString& Address, const FUniqueNetIdRepl& UniqueId, FString& ErrorMessage) override;
	virtual void PostLogin(APlayerController* NewPlayer) override;
	virtual void Logout(AController* Exiting) override;
	virtual bool MustSpectate_Implementation(APlayerController* NewPlayerController) const override;

	/** When true, new players stay spectators until EnterGame() starts the
	 *  session (persistent/login world). */
	bool bWaitForEnterGame = false;

	/** True once EnterGame() has run. */
	bool bGameStarted = false;

	/** Streams in the configured default additive levels on the server. */
	void LoadDefaultAdditiveLevels();

	/** Streams in a level by package path (e.g. "/Game/Additive/Lvl_Hub"). */
	UFUNCTION(Exec)
	void LoadAdditiveLevel(const FString& LevelPath);

	/** Removes a streamed-in level by package path. */
	UFUNCTION(Exec)
	void UnloadAdditiveLevel(const FString& LevelPath);

private:

	struct FPendingAuth
	{
		FString AccessToken;
		FString CharacterId;
	};

	/** Tracks an in-flight async load of all character data endpoints. */
	struct FPendingCharacterLoad
	{
		TWeakObjectPtr<APlayerController> Player;
		FString CharacterId;
		int32 Step = 0;
		FMMOCharacterData Data;
		FString JobsJson;
		FString InventoryJson;
		bool bDevFallback = false;
	};

	void OnVerifyTokenResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected, TWeakObjectPtr<APlayerController> Player, FString CharacterId);

	/** Sends the token to POST /internal/auth/verify; on success loads character data. */
	void RequestTokenVerification(TWeakObjectPtr<APlayerController> Player, const FString& AccessToken, const FString& CharacterId);

	/** Kicks off the chained GET requests to load character data from the backend. */
	void LoadCharacterData(TWeakObjectPtr<APlayerController> Player, const FString& CharacterId, bool bDevFallback);

	/** Continues the chained load sequence stored in Context. */
	void ContinueLoadCharacter(const TSharedPtr<FPendingCharacterLoad>& Context);

	/** Applies the loaded data to the player's AMMOPlayerState. */
	void ApplyLoadedCharacterData(const TSharedPtr<FPendingCharacterLoad>& Context);

	/** Creates a default character data block for offline/dev play. */
	void CreateDefaultPlayerState(APlayerController* Player, const FString& CharacterId);

	/** Sends current map/position and stats back to the backend on logout. */
	void SaveCharacterState(APlayerController* Player, const FString& CharacterId);

	/** Parses backend responses into the replicated structs. */
	void ParseStats(const FString& Body, TArray<FMMOCharacterStat>& OutStats);
	void ParseEquipment(const FString& Body, TArray<FMMOEquippedItem>& OutEquipment);
	void ParseAbilities(const FString& Body, TArray<FMMOAbility>& OutAbilities);
	void ParseHotbar(const FString& Body, TArray<FMMOHotbarSlot>& OutHotbar);
	void ParseProps(const FString& Body, TArray<FMMOCharacterProp>& OutProps);

	/** Builds a service-key HTTP request for internal endpoints. */
	TSharedRef<IHttpRequest> MakeInternalRequest(const FString& Verb, const FString& Path);

	/** Fires when the streamed game level finishes loading. */
	UFUNCTION()
	void OnGameLevelLoaded();

	/** Spawns PC immediately if the game level is loaded, otherwise queues it. */
	void QueuePlayerForSpawn(APlayerController* PC);

	/** Clears spectator state and restarts PC as a real pawn in the streamed level. */
	void SpawnPlayerNow(APlayerController* PC);

	/** Finds a PlayerStart inside the streamed game level (any world start as fallback). */
	APlayerStart* FindGamePlayerStart() const;

	/** Destroys actors tagged LoginBackdrop (the login map's cosmetic set). */
	void ClearLoginBackdrop();

	/** Reports an enter-game failure to the React HUD and resets session state. */
	void ReportEnterFailure(APlayerController* PC, const FString& Message);

	/** True once the streamed game level has finished loading. */
	bool bGameLevelLoaded = false;

	/** Players authenticated but waiting for the game level to stream in. */
	TArray<TWeakObjectPtr<APlayerController>> PlayersAwaitingSpawn;

	/** Players already given a pawn this session (dedupe guard). */
	TArray<TWeakObjectPtr<APlayerController>> SpawnedPlayers;

	// Address-keyed pending auth tokens. Collision-prone for NAT/shared IPs; use
	// UniqueNetId for production.
	TMap<FString, FPendingAuth> PendingAuths;

	/** Character ids that need a final save when the game mode shuts down. */
	TArray<TWeakObjectPtr<APlayerController>> PendingSavePlayers;
};

