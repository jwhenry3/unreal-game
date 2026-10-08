// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOLoginGameMode.h"
#include "MMOLoginPlayerController.h"
#include "GameFramework/WorldSettings.h"
#include "UObject/ConstructorHelpers.h"

AMMOLoginGameMode::AMMOLoginGameMode()
{
	// Use the real gameplay controller for the whole session: it applies the
	// game's input mapping contexts in SetupInputComponent, so the pawn it
	// eventually possesses can actually move. Its BeginPlay already gives us
	// GameAndUI + a visible cursor, which is all the login page needs.
	static ConstructorHelpers::FClassFinder<APlayerController> PCClass(
		TEXT("/Game/ThirdPerson/Blueprints/BP_ThirdPersonPlayerController"));
	PlayerControllerClass = PCClass.Class ? PCClass.Class.Get() : AMMOLoginPlayerController::StaticClass();

	// This is the persistent world: players spectate the login backdrop until
	// EnterGame() streams the play level in and hands them a pawn. The pawn
	// class comes from the inherited DefaultPawnClassPath config.
	bStartPlayersAsSpectators = true;
	bWaitForEnterGame = true;
}

AActor* AMMOLoginGameMode::FindPlayerStart_Implementation(AController* Player, const FString& IncomingName)
{
	// Once the game level is streamed in, use the real PlayerStart actors it
	// brought along; before that the login map has none, so spectate at the
	// world origin.
	if (bGameStarted)
	{
		return Super::FindPlayerStart_Implementation(Player, IncomingName);
	}
	return GetWorld() ? GetWorld()->GetWorldSettings() : nullptr;
}
