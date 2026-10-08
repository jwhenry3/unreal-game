// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOLoginPlayerController.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"

AMMOLoginPlayerController::AMMOLoginPlayerController()
{
}

void AMMOLoginPlayerController::BeginPlay()
{
	Super::BeginPlay();

	if (!IsLocalPlayerController())
	{
		return;
	}

	// The React login screen lives in the persistent web HUD; give it the mouse.
	SetInputMode(FInputModeUIOnly());
	SetShowMouseCursor(true);
}

void AMMOLoginPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();

	// This controller never goes through AMyGamePlayerController, which is
	// where the game normally applies its Enhanced Input mapping contexts.
	// Apply the same contexts here so the pawn it later possesses can move.
	ULocalPlayer* LocalPlayer = GetLocalPlayer();
	if (!LocalPlayer)
	{
		return;
	}
	UEnhancedInputLocalPlayerSubsystem* Subsystem =
		LocalPlayer->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>();
	if (!Subsystem)
	{
		return;
	}

	static const TCHAR* ContextPaths[] = {
		TEXT("/Game/Input/IMC_Default.IMC_Default"),
		TEXT("/Game/Input/IMC_MouseLook.IMC_MouseLook"),
	};
	for (const TCHAR* Path : ContextPaths)
	{
		if (UInputMappingContext* Context = LoadObject<UInputMappingContext>(nullptr, Path))
		{
			if (!Subsystem->HasMappingContext(Context))
			{
				Subsystem->AddMappingContext(Context, 0);
			}
		}
	}
}
