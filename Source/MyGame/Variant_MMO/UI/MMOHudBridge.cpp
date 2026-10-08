// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOHudBridge.h"
#include "MMOWebHud.h"

void UMMOHudBridge::RegisterViewport(const FString& Payload)
{
	if (Hud) Hud->BridgeRegisterViewport(Payload);
}

void UMMOHudBridge::MoveViewport(const FString& Payload)
{
	if (Hud) Hud->BridgeMoveViewport(Payload);
}

void UMMOHudBridge::UnregisterViewport(const FString& Payload)
{
	if (Hud) Hud->BridgeUnregisterViewport(Payload);
}

void UMMOHudBridge::Notify(const FString& Payload)
{
	if (Hud) Hud->BridgeNotify(Payload);
}
