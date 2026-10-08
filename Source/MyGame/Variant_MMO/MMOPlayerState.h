// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerState.h"
#include "MMOPlayerState.generated.h"

USTRUCT(BlueprintType)
struct FMMOCharacterStat
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString StatKey;

	UPROPERTY(BlueprintReadOnly)
	float BaseValue = 0.f;

	UPROPERTY(BlueprintReadOnly)
	float BonusValue = 0.f;

	UPROPERTY(BlueprintReadOnly)
	float CurrentValue = 0.f;
};

USTRUCT(BlueprintType)
struct FMMOEquippedItem
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString SlotKey;

	UPROPERTY(BlueprintReadOnly)
	FString ItemKey;

	UPROPERTY(BlueprintReadOnly)
	FString InventoryItemId;

	UPROPERTY(BlueprintReadOnly)
	bool bIsVisible = true;
};

USTRUCT(BlueprintType)
struct FMMOAbility
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString AbilityKey;

	UPROPERTY(BlueprintReadOnly)
	int32 Rank = 1;

	UPROPERTY(BlueprintReadOnly)
	bool bIsUnlocked = false;

	UPROPERTY(BlueprintReadOnly)
	FString SourceJob;

	UPROPERTY(BlueprintReadOnly)
	FString CooldownAt;
};

USTRUCT(BlueprintType)
struct FMMOHotbarSlot
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	int32 SlotId = 0;

	UPROPERTY(BlueprintReadOnly)
	FString Type;

	UPROPERTY(BlueprintReadOnly)
	FString AbilityKey;

	UPROPERTY(BlueprintReadOnly)
	FString InventoryItemId;

	UPROPERTY(BlueprintReadOnly)
	FString MacroId;
};

USTRUCT(BlueprintType)
struct FMMOCharacterProp
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString PropId;

	UPROPERTY(BlueprintReadOnly)
	FString PropKey;

	UPROPERTY(BlueprintReadOnly)
	FString InventoryItemId;

	UPROPERTY(BlueprintReadOnly)
	bool bIsMounted = false;

	UPROPERTY(BlueprintReadOnly)
	FString TransformJson;
};

USTRUCT(BlueprintType)
struct FMMOCharacterData
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString CharacterId;

	UPROPERTY(BlueprintReadOnly)
	FString Name;

	UPROPERTY(BlueprintReadOnly)
	FString Realm;

	UPROPERTY(BlueprintReadOnly)
	FString MainJob;

	UPROPERTY(BlueprintReadOnly)
	FString SubJob;

	UPROPERTY(BlueprintReadOnly)
	int32 Level = 1;

	UPROPERTY(BlueprintReadOnly)
	TArray<FMMOCharacterStat> Stats;

	UPROPERTY(BlueprintReadOnly)
	TArray<FMMOEquippedItem> Equipment;

	UPROPERTY(BlueprintReadOnly)
	TArray<FMMOAbility> Abilities;

	UPROPERTY(BlueprintReadOnly)
	TArray<FMMOHotbarSlot> Hotbar;

	UPROPERTY(BlueprintReadOnly)
	TArray<FMMOCharacterProp> Props;
};

/**
 * Replicated player state for the MMO variant. Holds character data loaded
 * from the backend so that AMyGameCharacter, the HUD, and gameplay systems
 * can read it on both server and clients.
 */
UCLASS()
class AMMOPlayerState : public APlayerState
{
	GENERATED_BODY()

public:
	AMMOPlayerState();

	/** Core character data replicated to the owning client. */
	UPROPERTY(ReplicatedUsing = OnRep_CharacterData, BlueprintReadOnly, Category = "MMO")
	FMMOCharacterData CharacterData;

	/** Raw inventory JSON as returned by /internal/characters/:id/inventory. */
	UPROPERTY(ReplicatedUsing = OnRep_InventoryJson, BlueprintReadOnly, Category = "MMO")
	FString InventoryJson;

	/** Raw job-progress JSON as returned by /internal/characters/:id/jobs. */
	UPROPERTY(ReplicatedUsing = OnRep_JobsJson, BlueprintReadOnly, Category = "MMO")
	FString JobsJson;

	UFUNCTION()
	void OnRep_CharacterData();

	UFUNCTION()
	void OnRep_InventoryJson();

	UFUNCTION()
	void OnRep_JobsJson();

	/** Server-only helper to overwrite the whole character data block. */
	void SetCharacterData(const FMMOCharacterData& InData);

	/** Server-only helper to overwrite the inventory JSON blob. */
	void SetInventoryJson(const FString& InJson);

	/** Server-only helper to overwrite the jobs JSON blob. */
	void SetJobsJson(const FString& InJson);

protected:
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void CopyProperties(APlayerState* PlayerState) override;

	/** Logs and triggers any blueprint/gameplay callbacks when data changes. */
	void NotifyCharacterDataChanged();
};
