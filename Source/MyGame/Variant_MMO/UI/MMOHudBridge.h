// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "MMOHudBridge.generated.h"

class UMMOWebHud;

/**
 *  UObject bound into the CEF page as `ue.hud`. Every UFUNCTION takes a single
 *  JSON string argument and forwards to the HUD widget — keeping the JS<->UE
 *  surface generic so new calls don't require signature churn.
 *
 *  Payloads:
 *    RegisterViewport: {"id":"paperdoll","rect":{"x":0.1,"y":0.2,"w":0.3,"h":0.4},
 *                       "camera":{"location":[x,y,z],"rotation":[p,y,r],"fov":30},
 *                       "live":true}
 *    MoveViewport:     {"id":"paperdoll","rect":{...}}
 *    UnregisterViewport:{"id":"paperdoll"}
 *    Notify:           {"event":"menu.click","data":{...}}  (echoed to BP via OnHudEvent)
 *                       {"event":"ui.textfocus","data":{"focused":true}} — handled in C++
 */
UCLASS(BlueprintType)
class UMMOHudBridge : public UObject
{
	GENERATED_BODY()

public:

	/** Owning HUD — set by UMMOWebHud before binding. */
	UMMOWebHud* Hud = nullptr;

	UFUNCTION()
	void RegisterViewport(const FString& Payload);

	UFUNCTION()
	void MoveViewport(const FString& Payload);

	UFUNCTION()
	void UnregisterViewport(const FString& Payload);

	UFUNCTION()
	void Notify(const FString& Payload);
};
