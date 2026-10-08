// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "MMOGameMode.h"
#include "MMOLoginGameMode.generated.h"

/**
 *  Game mode for the persistent login map. Inherits the auth/streaming
 *  behavior of AMMOGameMode; players spectate until EnterGame() streams the
 *  play level in additively and spawns them.
 */
UCLASS(Blueprintable)
class AMMOLoginGameMode : public AMMOGameMode
{
	GENERATED_BODY()

public:

	/** Constructor */
	AMMOLoginGameMode();

protected:
	virtual AActor* FindPlayerStart_Implementation(AController* Player, const FString& IncomingName = TEXT("")) override;
};
