// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOPlayerState.h"

#include "Net/UnrealNetwork.h"

AMMOPlayerState::AMMOPlayerState()
{
	// Replicate only to the owning client to keep bandwidth low.
	SetNetUpdateFrequency(10.f);
}

void AMMOPlayerState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	DOREPLIFETIME_CONDITION(AMMOPlayerState, CharacterData, COND_OwnerOnly);
	DOREPLIFETIME_CONDITION(AMMOPlayerState, InventoryJson, COND_OwnerOnly);
	DOREPLIFETIME_CONDITION(AMMOPlayerState, JobsJson, COND_OwnerOnly);
}

void AMMOPlayerState::CopyProperties(APlayerState* PlayerState)
{
	Super::CopyProperties(PlayerState);

	if (AMMOPlayerState* MMOPlayerState = Cast<AMMOPlayerState>(PlayerState))
	{
		MMOPlayerState->CharacterData = CharacterData;
		MMOPlayerState->InventoryJson = InventoryJson;
		MMOPlayerState->JobsJson = JobsJson;
	}
}

void AMMOPlayerState::OnRep_CharacterData()
{
	NotifyCharacterDataChanged();
}

void AMMOPlayerState::OnRep_InventoryJson()
{
	NotifyCharacterDataChanged();
}

void AMMOPlayerState::OnRep_JobsJson()
{
	NotifyCharacterDataChanged();
}

void AMMOPlayerState::SetCharacterData(const FMMOCharacterData& InData)
{
	if (HasAuthority())
	{
		CharacterData = InData;
		ForceNetUpdate();
		NotifyCharacterDataChanged();
	}
}

void AMMOPlayerState::SetInventoryJson(const FString& InJson)
{
	if (HasAuthority())
	{
		InventoryJson = InJson;
		ForceNetUpdate();
		NotifyCharacterDataChanged();
	}
}

void AMMOPlayerState::SetJobsJson(const FString& InJson)
{
	if (HasAuthority())
	{
		JobsJson = InJson;
		ForceNetUpdate();
		NotifyCharacterDataChanged();
	}
}

void AMMOPlayerState::NotifyCharacterDataChanged()
{
	UE_LOG(LogTemp, Verbose, TEXT("AMMOPlayerState: character data updated for %s"), *GetPlayerName());

	// Gameplay/HUD hooks can subscribe to this with a delegate or react to
	// the replicated properties directly. For now we just log.
}
