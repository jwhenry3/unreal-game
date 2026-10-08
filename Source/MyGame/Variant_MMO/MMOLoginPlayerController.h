// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "MMOLoginPlayerController.generated.h"

/**
 *  Player controller for the standalone MMO login map.
 *  The login UI itself is rendered by the React web HUD owned by
 *  UMMOGameInstance — this controller only puts the viewport in
 *  UI-input mode so the page receives pointer input.
 */
UCLASS(Blueprintable, Config="Game")
class AMMOLoginPlayerController : public APlayerController
{
	GENERATED_BODY()

public:

	/** Constructor */
	AMMOLoginPlayerController();

protected:

	/** Gameplay initialization */
	virtual void BeginPlay() override;

	/** Applies the gameplay input mapping contexts so a possessed pawn can move */
	virtual void SetupInputComponent() override;
};
