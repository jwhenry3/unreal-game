// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "MMOLoginWidget.generated.h"

class UButton;
class UCheckBox;
class UComboBoxString;
class UEditableTextBox;
class UTextBlock;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_FourParams(FMMOLoginRequestedSignature, const FString&, Username, const FString&, Password, const FString&, ServerName, bool, bRememberMe);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FMMOQuitRequestedSignature);

/**
 *  MMO account login screen
 *  Builds its UMG layout in C++ and exposes authentication to the owning controller
 */
UCLASS(BlueprintType)
class UMMOLoginWidget : public UUserWidget
{
	GENERATED_BODY()

public:

	/** Constructor */
	UMMOLoginWidget(const FObjectInitializer& ObjectInitializer);

	/** Raised when the player submits credentials */
	UPROPERTY(BlueprintAssignable, Category="Login")
	FMMOLoginRequestedSignature OnLoginRequested;

	/** Raised when the player asks to quit */
	UPROPERTY(BlueprintAssignable, Category="Login")
	FMMOQuitRequestedSignature OnQuitRequested;

	/** Game title shown at the top of the panel */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Login|Appearance")
	FText GameTitle;

	/** Smaller line shown beneath the title */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="Login|Appearance")
	FText GameSubtitle;

	/** Available realm/world names */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Login")
	TArray<FString> ServerNames;

	/** Display an authentication or validation error */
	UFUNCTION(BlueprintCallable, Category="Login")
	void ShowLoginError(const FText& ErrorMessage);

	/** Hide the status message */
	UFUNCTION(BlueprintCallable, Category="Login")
	void ClearLoginFeedback();

	/** Enable or disable controls while an authentication request is running */
	UFUNCTION(BlueprintCallable, Category="Login")
	void SetLoginInProgress(bool bInProgress);

	/** Current account name */
	UFUNCTION(BlueprintPure, Category="Login")
	FString GetEnteredUsername() const;

	/** Current password */
	UFUNCTION(BlueprintPure, Category="Login")
	FString GetEnteredPassword() const;

	/** Selected realm/world */
	UFUNCTION(BlueprintPure, Category="Login")
	FString GetSelectedServerName() const;

	/** Returns whether remember-me is selected */
	UFUNCTION(BlueprintPure, Category="Login")
	bool ShouldRememberAccount() const;

protected:

	/** UMG initialization */
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;

	/** Builds the runtime widget tree */
	void BuildInterface();

	/** Text construction helper */
	UTextBlock* CreateTextBlock(const FName& WidgetName, const FText& Text, int32 FontSize, const FLinearColor& Color, ETextJustify::Type Justification = ETextJustify::Left) const;

	/** Button construction helper */
	UButton* CreateButton(const FName& WidgetName, const FText& Label, const FLinearColor& ButtonColor, const FLinearColor& LabelColor);

	/** Adds a widget to a vertical box */
	void AddVerticalChild(class UVerticalBox* Box, UWidget* Child, const FMargin& ChildPadding, EHorizontalAlignment HorizontalAlignment = HAlign_Fill) const;

	/** Called when the sign-in button is clicked */
	UFUNCTION()
	void HandleLoginClicked();

	/** Called when create account is clicked */
	UFUNCTION()
	void HandleCreateAccountClicked();

	/** Called when forgot password is clicked */
	UFUNCTION()
	void HandleForgotPasswordClicked();

	/** Called when quit is clicked */
	UFUNCTION()
	void HandleQuitClicked();

	/** Moves focus from account name to password */
	UFUNCTION()
	void HandleUsernameCommitted(const FText& Text, ETextCommit::Type CommitMethod);

	/** Submits when Enter is pressed in the password field */
	UFUNCTION()
	void HandlePasswordCommitted(const FText& Text, ETextCommit::Type CommitMethod);

private:

	/** Account name input */
	UPROPERTY()
	TObjectPtr<UEditableTextBox> UsernameInput;

	/** Password input */
	UPROPERTY()
	TObjectPtr<UEditableTextBox> PasswordInput;

	/** Realm selector */
	UPROPERTY()
	TObjectPtr<UComboBoxString> ServerSelector;

	/** Remember account toggle */
	UPROPERTY()
	TObjectPtr<UCheckBox> RememberMeCheckBox;

	/** Sign-in button */
	UPROPERTY()
	TObjectPtr<UButton> LoginButton;

	/** Text inside the sign-in button */
	UPROPERTY()
	TObjectPtr<UTextBlock> LoginButtonText;

	/** Authentication status line */
	UPROPERTY()
	TObjectPtr<UTextBlock> StatusText;
};
