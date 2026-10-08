// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "MMOPlayerState.h"
#include "MMOGameInstance.generated.h"

class UMMOWebHud;
class UWorld;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_FourParams(FMMOAuthenticationRequestedSignature, const FString&, Username, const FString&, Password, const FString&, ServerName, bool, bRememberMe);

/**
 *  MMO game instance — owns the persistent React/CEF web HUD and the login flow.
 *
 *  The UMMOWebHud is spawned once, as soon as the first world initializes, and
 *  added to the game viewport: it survives OpenLevel travel, so the same CEF
 *  page renders the React login screen on the login map and the in-game HUD on
 *  the play map without a reload.
 *
 *  Auth is driven by JSON events from the page (ue.hud.notify):
 *    {"event":"hello"}                          -> game replies with phase+servers
 *    {"event":"login.submit","data":{...}}      -> authenticates, then travels
 *    {"event":"login.quit"}                     -> quits the game
 *
 *  Events pushed back into the page (window.ueDispatch):
 *    {"type":"phase","phase":"login"|"game"}
 *    {"type":"servers","servers":["Name",...]}
 *    {"type":"login.result","ok":bool,"message":"..."}
 */
UCLASS(Config = "Game")
class UMMOGameInstance : public UGameInstance
{
	GENERATED_BODY()

public:

	virtual void Init() override;
	virtual void StartGameInstance() override;
	virtual void Shutdown() override;

	/** Spawn/attach the web HUD to the viewport. Idempotent. */
	void EnsureWebHud(UWorld* World);

	/** JSON event entry point — bound to the HUD's OnHudEvent. */
	UFUNCTION()
	void HandleHudEvent(const FString& Payload);

	/** Push a JSON object into the page via window.ueDispatch(<json>). */
	void SendToWeb(const FString& Json);

	/** Resolve an in-flight authentication attempt (used by custom auth listeners and the built-in HTTP flow). */
	UFUNCTION(BlueprintCallable, Category = "Login")
	void CompleteLogin(bool bSucceeded, const FText& FailureMessage);

	/** Report a post-login failure back to the page and return to the login phase. */
	void ReturnToLogin(const FString& Message);

	/** Bind to implement custom authentication; skips the built-in HTTP call. Call CompleteLogin when done. */
	UPROPERTY(BlueprintAssignable, Category = "Login")
	FMMOAuthenticationRequestedSignature OnAuthenticationRequested;

	/** Base URL of the auth backend. Default 3100 avoids the MCP HTTP surface on :3000. */
	UPROPERTY(EditAnywhere, Config, Category = "Login")
	FString AuthBaseUrl = TEXT("http://localhost:3100");

	/** Accept any credentials when no auth backend URL is configured */
	UPROPERTY(EditAnywhere, Config, Category = "Login")
	bool bAllowDevelopmentLogin = false;

	/** World loaded after a successful login when not connecting to a dedicated server. */
	UPROPERTY(EditAnywhere, Category = "Login|Flow")
	FSoftObjectPath PostLoginMap;

	/** Dedicated server address to ClientTravel to after login (e.g. 127.0.0.1:7777). Empty falls back to a local PostLoginMap. */
	UPROPERTY(EditAnywhere, Config, Category = "Login|Flow")
	FString DefaultGameServerAddress;

	/** If true, the client opens PostLoginMap as a listen server instead of traveling to DefaultGameServerAddress.
	 *  This is the easiest way to test multiplayer in PIE without a dedicated server binary.
	 */
	UPROPERTY(EditAnywhere, Config, Category = "Login|Flow")
	bool bSelfHostMode = true;

	/** Currently selected character id, set by the character-select screen. */
	UPROPERTY(BlueprintReadOnly, Category = "Login")
	FString SelectedCharacterId;

	/** Realm selected on the login screen, used as the default realm for new characters. */
	UPROPERTY(BlueprintReadOnly, Category = "Login")
	FString SelectedServerName;

	/** Fetch owned characters after login so the page can render character select. */
	void FetchCharacters();
	void OnCharactersResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);

	/** Create a new character for the logged-in account. */
	void CreateCharacter(const FString& Name, const FString& Job, const FString& SubJob);
	void OnCreateCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);

	/** Called from the page after the player picks a character. */
	UFUNCTION()
	void SelectCharacter(const FString& CharacterId);

	/** Travel to the game server/map using the selected character. */
	void TravelToGame();

	/** Spawn the React/CEF web HUD on startup */
	UPROPERTY(EditAnywhere, Category = "UI")
	bool bEnableWebHud = true;

	/** Current session tokens, for later authenticated API calls. */
	UPROPERTY(BlueprintReadOnly, Category = "Login")
	FString AccessToken;

	UPROPERTY(BlueprintReadOnly, Category = "Login")
	FString RefreshToken;

	UMMOWebHud* GetWebHud() const { return WebHud; }

protected:

	void OnPostWorldInit(UWorld* World, const UWorld::InitializationValues IVS);
	void OnWorldBeginPlayFallback();

	void SubmitLogin(const FString& Username, const FString& Password, const FString& ServerName, bool bRememberMe);
	void OnLoginResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);
	void SubmitRegister(const FString& Username, const FString& Email, const FString& Password);
	void OnRegisterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);
	void FetchServers();
	void OnServersResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);
	void PushPhase();
	void PushServers();
	void PushCharacters(const TArray<TSharedPtr<FJsonValue>>& Characters);
	void PushLoginResult(bool bOk, const FString& Message);

	/** Pushes the local player's state to the HUD if it is available. */
	void TryPushAllPlayerState();

	/** Builds and sends all MMO state events to the React HUD. */
	void PushPlayerStateEvents(AMMOPlayerState* PlayerState);

	UPROPERTY()
	TObjectPtr<UMMOWebHud> WebHud;

	UPROPERTY()
	TArray<FString> ServerNames;

	FString Phase = TEXT("login");
	bool bLoginInFlight = false;
	bool bServersFetched = false;
	FDelegateHandle WorldInitHandle;
	FTimerHandle PushStateTimerHandle;
};
