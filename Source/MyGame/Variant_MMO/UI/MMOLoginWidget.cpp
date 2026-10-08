// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOLoginWidget.h"

#include "Components/Border.h"
#include "Components/Button.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/CheckBox.h"
#include "Components/ComboBoxString.h"
#include "Components/EditableTextBox.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/SizeBox.h"
#include "Components/Spacer.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Styling/CoreStyle.h"
#include "Blueprint/WidgetTree.h"

#define LOCTEXT_NAMESPACE "MMOLogin"

namespace
{
	FSlateFontInfo MakeFont(const int32 Size)
	{
		FSlateFontInfo Font = FCoreStyle::Get().GetFontStyle(TEXT("Roboto"));
		Font.Size = Size;
		return Font;
	}
}

UMMOLoginWidget::UMMOLoginWidget(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	GameTitle = LOCTEXT("GameTitle", "MYGAME ONLINE");
	GameSubtitle = LOCTEXT("GameSubtitle", "SECURE REALM ACCESS");
	ServerNames = {
		TEXT("North America"),
		TEXT("Europe"),
		TEXT("Asia")
	};
}

void UMMOLoginWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();

	BuildInterface();
}

void UMMOLoginWidget::NativeConstruct()
{
	Super::NativeConstruct();

	if (UsernameInput)
	{
		UsernameInput->OnTextCommitted.AddUniqueDynamic(this, &UMMOLoginWidget::HandleUsernameCommitted);
		UsernameInput->SetKeyboardFocus();
	}

	if (PasswordInput)
	{
		PasswordInput->OnTextCommitted.AddUniqueDynamic(this, &UMMOLoginWidget::HandlePasswordCommitted);
	}

	if (LoginButton)
	{
		LoginButton->OnClicked.AddUniqueDynamic(this, &UMMOLoginWidget::HandleLoginClicked);
	}
}

void UMMOLoginWidget::BuildInterface()
{
	if (!WidgetTree || WidgetTree->RootWidget)
	{
		return;
	}

	const FLinearColor BackgroundColor(0.004f, 0.007f, 0.016f, 1.0f);
	const FLinearColor PanelColor(0.018f, 0.028f, 0.052f, 0.97f);
	const FLinearColor InputColor(0.035f, 0.055f, 0.095f, 1.0f);
	const FLinearColor InputFocusedColor(0.050f, 0.085f, 0.145f, 1.0f);
	const FLinearColor AccentColor(0.00f, 0.58f, 0.92f, 1.0f);
	const FLinearColor TextColor(0.88f, 0.94f, 1.00f, 1.0f);
	const FLinearColor MutedTextColor(0.43f, 0.55f, 0.68f, 1.0f);
	const FLinearColor ErrorColor(1.00f, 0.24f, 0.30f, 1.0f);
	const FLinearColor ButtonColor(0.00f, 0.35f, 0.72f, 1.0f);
	const FLinearColor SecondaryButtonColor(0.045f, 0.070f, 0.120f, 1.0f);

	UCanvasPanel* RootCanvas = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("RootCanvas"));
	WidgetTree->RootWidget = RootCanvas;

	UBorder* Background = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("Background"));
	Background->SetBrushColor(BackgroundColor);
	if (UCanvasPanelSlot* BackgroundSlot = RootCanvas->AddChildToCanvas(Background))
	{
		BackgroundSlot->SetAnchors(FAnchors(0.0f, 0.0f, 1.0f, 1.0f));
		BackgroundSlot->SetOffsets(FMargin(0.0f));
	}

	USizeBox* PanelSizeBox = WidgetTree->ConstructWidget<USizeBox>(USizeBox::StaticClass(), TEXT("PanelSizeBox"));
	PanelSizeBox->SetWidthOverride(520.0f);
	if (UCanvasPanelSlot* PanelSlot = RootCanvas->AddChildToCanvas(PanelSizeBox))
	{
		PanelSlot->SetAnchors(FAnchors(0.5f, 0.5f));
		PanelSlot->SetAlignment(FVector2D(0.5f, 0.5f));
		PanelSlot->SetPosition(FVector2D::ZeroVector);
		PanelSlot->SetAutoSize(true);
	}

	UBorder* PanelBorder = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("LoginPanel"));
	PanelBorder->SetBrushColor(PanelColor);
	PanelBorder->SetPadding(FMargin(42.0f, 34.0f));
	PanelSizeBox->SetContent(PanelBorder);

	UVerticalBox* Content = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("LoginContent"));
	PanelBorder->SetContent(Content);

	AddVerticalChild(Content, CreateTextBlock(TEXT("TitleText"), GameTitle, 30, TextColor, ETextJustify::Center), FMargin(0.0f, 0.0f, 0.0f, 4.0f), HAlign_Center);
	AddVerticalChild(Content, CreateTextBlock(TEXT("SubtitleText"), GameSubtitle, 11, AccentColor, ETextJustify::Center), FMargin(0.0f, 0.0f, 0.0f, 22.0f), HAlign_Center);

	USizeBox* AccentRule = WidgetTree->ConstructWidget<USizeBox>(USizeBox::StaticClass(), TEXT("AccentRule"));
	AccentRule->SetHeightOverride(2.0f);
	UBorder* AccentBorder = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("AccentBorder"));
	AccentBorder->SetBrushColor(AccentColor);
	AccentRule->SetContent(AccentBorder);
	AddVerticalChild(Content, AccentRule, FMargin(0.0f, 0.0f, 0.0f, 26.0f));

	AddVerticalChild(Content, CreateTextBlock(TEXT("UsernameLabel"), LOCTEXT("UsernameLabel", "ACCOUNT NAME"), 10, MutedTextColor), FMargin(0.0f, 0.0f, 0.0f, 6.0f));
	UsernameInput = WidgetTree->ConstructWidget<UEditableTextBox>(UEditableTextBox::StaticClass(), TEXT("UsernameInput"));
	UsernameInput->SetHintText(LOCTEXT("UsernameHint", "Enter account name"));
	UsernameInput->SetToolTipText(LOCTEXT("UsernameTooltip", "Your MMO account name"));
	FEditableTextBoxStyle UsernameStyle = UsernameInput->GetWidgetStyle();
	UsernameStyle.TextStyle.Font = MakeFont(14);
	UsernameStyle.ForegroundColor = FSlateColor(TextColor);
	UsernameStyle.BackgroundImageNormal.TintColor = FSlateColor(InputColor);
	UsernameStyle.BackgroundImageHovered.TintColor = FSlateColor(InputFocusedColor);
	UsernameStyle.BackgroundImageFocused.TintColor = FSlateColor(InputFocusedColor);
	UsernameInput->SetWidgetStyle(UsernameStyle);
	AddVerticalChild(Content, UsernameInput, FMargin(0.0f, 0.0f, 0.0f, 18.0f));

	AddVerticalChild(Content, CreateTextBlock(TEXT("PasswordLabel"), LOCTEXT("PasswordLabel", "PASSWORD"), 10, MutedTextColor), FMargin(0.0f, 0.0f, 0.0f, 6.0f));
	PasswordInput = WidgetTree->ConstructWidget<UEditableTextBox>(UEditableTextBox::StaticClass(), TEXT("PasswordInput"));
	PasswordInput->SetHintText(LOCTEXT("PasswordHint", "Enter password"));
	PasswordInput->SetIsPassword(true);
	PasswordInput->SetToolTipText(LOCTEXT("PasswordTooltip", "Your account password"));
	FEditableTextBoxStyle PasswordStyle = PasswordInput->GetWidgetStyle();
	PasswordStyle.TextStyle.Font = MakeFont(14);
	PasswordStyle.ForegroundColor = FSlateColor(TextColor);
	PasswordStyle.BackgroundImageNormal.TintColor = FSlateColor(InputColor);
	PasswordStyle.BackgroundImageHovered.TintColor = FSlateColor(InputFocusedColor);
	PasswordStyle.BackgroundImageFocused.TintColor = FSlateColor(InputFocusedColor);
	PasswordInput->SetWidgetStyle(PasswordStyle);
	AddVerticalChild(Content, PasswordInput, FMargin(0.0f, 0.0f, 0.0f, 18.0f));

	AddVerticalChild(Content, CreateTextBlock(TEXT("ServerLabel"), LOCTEXT("ServerLabel", "WORLD"), 10, MutedTextColor), FMargin(0.0f, 0.0f, 0.0f, 6.0f));
	ServerSelector = WidgetTree->ConstructWidget<UComboBoxString>(UComboBoxString::StaticClass(), TEXT("ServerSelector"));
	for (const FString& ServerName : ServerNames)
	{
		ServerSelector->AddOption(ServerName);
	}
	if (ServerNames.Num() > 0)
	{
		ServerSelector->SetSelectedIndex(0);
	}
	AddVerticalChild(Content, ServerSelector, FMargin(0.0f, 0.0f, 0.0f, 18.0f));

	RememberMeCheckBox = WidgetTree->ConstructWidget<UCheckBox>(UCheckBox::StaticClass(), TEXT("RememberMeCheckBox"));
	RememberMeCheckBox->SetIsChecked(true);
	RememberMeCheckBox->SetContent(CreateTextBlock(TEXT("RememberMeText"), LOCTEXT("RememberMe", "Remember account on this device"), 12, MutedTextColor));
	AddVerticalChild(Content, RememberMeCheckBox, FMargin(0.0f, 0.0f, 0.0f, 22.0f));

	LoginButton = CreateButton(TEXT("LoginButton"), LOCTEXT("LoginButton", "SIGN IN"), ButtonColor, TextColor);
	LoginButtonText = Cast<UTextBlock>(LoginButton->GetContent());
	AddVerticalChild(Content, LoginButton, FMargin(0.0f, 0.0f, 0.0f, 12.0f));

	UHorizontalBox* SecondaryActions = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass(), TEXT("SecondaryActions"));
	AddVerticalChild(Content, SecondaryActions, FMargin(0.0f, 0.0f, 0.0f, 12.0f));

	UButton* CreateAccountButton = CreateButton(TEXT("CreateAccountButton"), LOCTEXT("CreateAccount", "CREATE ACCOUNT"), SecondaryButtonColor, MutedTextColor);
	CreateAccountButton->OnClicked.AddUniqueDynamic(this, &UMMOLoginWidget::HandleCreateAccountClicked);
	if (UHorizontalBoxSlot* CreateAccountSlot = Cast<UHorizontalBoxSlot>(SecondaryActions->AddChild(CreateAccountButton)))
	{
		CreateAccountSlot->SetPadding(FMargin(0.0f, 0.0f, 6.0f, 0.0f));
		CreateAccountSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));
	}

	UButton* ForgotPasswordButton = CreateButton(TEXT("ForgotPasswordButton"), LOCTEXT("ForgotPassword", "FORGOT PASSWORD?"), SecondaryButtonColor, MutedTextColor);
	ForgotPasswordButton->OnClicked.AddUniqueDynamic(this, &UMMOLoginWidget::HandleForgotPasswordClicked);
	if (UHorizontalBoxSlot* ForgotPasswordSlot = Cast<UHorizontalBoxSlot>(SecondaryActions->AddChild(ForgotPasswordButton)))
	{
		ForgotPasswordSlot->SetPadding(FMargin(6.0f, 0.0f, 0.0f, 0.0f));
		ForgotPasswordSlot->SetSize(FSlateChildSize(ESlateSizeRule::Fill));
	}

	StatusText = CreateTextBlock(TEXT("StatusText"), FText::GetEmpty(), 11, ErrorColor, ETextJustify::Center);
	StatusText->SetAutoWrapText(true);
	AddVerticalChild(Content, StatusText, FMargin(0.0f, 0.0f, 0.0f, 14.0f), HAlign_Center);

	UHorizontalBox* Footer = WidgetTree->ConstructWidget<UHorizontalBox>(UHorizontalBox::StaticClass(), TEXT("Footer"));
	AddVerticalChild(Content, Footer, FMargin(0.0f), HAlign_Center);

	UTextBlock* FooterText = CreateTextBlock(TEXT("FooterText"), LOCTEXT("Footer", "Encrypted connection"), 10, MutedTextColor);
	if (UHorizontalBoxSlot* FooterTextSlot = Cast<UHorizontalBoxSlot>(Footer->AddChild(FooterText)))
	{
		FooterTextSlot->SetPadding(FMargin(0.0f, 0.0f, 18.0f, 0.0f));
	}

	UButton* QuitButton = CreateButton(TEXT("QuitButton"), LOCTEXT("Quit", "EXIT"), SecondaryButtonColor, MutedTextColor);
	QuitButton->OnClicked.AddUniqueDynamic(this, &UMMOLoginWidget::HandleQuitClicked);
	if (UHorizontalBoxSlot* QuitSlot = Cast<UHorizontalBoxSlot>(Footer->AddChild(QuitButton)))
	{
		QuitSlot->SetPadding(FMargin(0.0f));
	}
}

UTextBlock* UMMOLoginWidget::CreateTextBlock(const FName& WidgetName, const FText& Text, const int32 FontSize, const FLinearColor& Color, const ETextJustify::Type Justification) const
{
	UTextBlock* TextBlock = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), WidgetName);
	TextBlock->SetText(Text);
	TextBlock->SetFont(MakeFont(FontSize));
	TextBlock->SetColorAndOpacity(FSlateColor(Color));
	TextBlock->SetJustification(Justification);
	return TextBlock;
}

UButton* UMMOLoginWidget::CreateButton(const FName& WidgetName, const FText& Label, const FLinearColor& ButtonColor, const FLinearColor& LabelColor)
{
	UButton* Button = WidgetTree->ConstructWidget<UButton>(UButton::StaticClass(), WidgetName);
	UTextBlock* ButtonText = CreateTextBlock(FName(*(WidgetName.ToString() + TEXT("_Text"))), Label, 12, LabelColor, ETextJustify::Center);
	Button->SetContent(ButtonText);
	Button->SetColorAndOpacity(ButtonColor);
	return Button;
}

void UMMOLoginWidget::AddVerticalChild(UVerticalBox* Box, UWidget* Child, const FMargin& ChildPadding, const EHorizontalAlignment HorizontalAlignment) const
{
	if (UVerticalBoxSlot* BoxSlot = Cast<UVerticalBoxSlot>(Box->AddChild(Child)))
	{
		BoxSlot->SetPadding(ChildPadding);
		BoxSlot->SetHorizontalAlignment(HorizontalAlignment);
	}
}

void UMMOLoginWidget::ShowLoginError(const FText& ErrorMessage)
{
	SetLoginInProgress(false);

	if (StatusText)
	{
		StatusText->SetText(ErrorMessage);
	}
}

void UMMOLoginWidget::ClearLoginFeedback()
{
	if (StatusText)
	{
		StatusText->SetText(FText::GetEmpty());
	}
}

void UMMOLoginWidget::SetLoginInProgress(const bool bInProgress)
{
	if (LoginButton)
	{
		LoginButton->SetIsEnabled(!bInProgress);
	}

	if (LoginButtonText)
	{
		LoginButtonText->SetText(bInProgress ? LOCTEXT("Connecting", "CONNECTING...") : LOCTEXT("LoginButton", "SIGN IN"));
	}

	if (UsernameInput)
	{
		UsernameInput->SetIsEnabled(!bInProgress);
	}

	if (PasswordInput)
	{
		PasswordInput->SetIsEnabled(!bInProgress);
	}

	if (ServerSelector)
	{
		ServerSelector->SetIsEnabled(!bInProgress);
	}

	if (RememberMeCheckBox)
	{
		RememberMeCheckBox->SetIsEnabled(!bInProgress);
	}
}

FString UMMOLoginWidget::GetEnteredUsername() const
{
	return UsernameInput ? UsernameInput->GetText().ToString().TrimStartAndEnd() : FString();
}

FString UMMOLoginWidget::GetEnteredPassword() const
{
	return PasswordInput ? PasswordInput->GetText().ToString() : FString();
}

FString UMMOLoginWidget::GetSelectedServerName() const
{
	return ServerSelector ? ServerSelector->GetSelectedOption() : FString();
}

bool UMMOLoginWidget::ShouldRememberAccount() const
{
	return RememberMeCheckBox && RememberMeCheckBox->IsChecked();
}

void UMMOLoginWidget::HandleLoginClicked()
{
	const FString Username = GetEnteredUsername();
	const FString Password = GetEnteredPassword();

	if (Username.IsEmpty())
	{
		ShowLoginError(LOCTEXT("MissingUsername", "Enter your account name."));
		return;
	}

	if (Password.IsEmpty())
	{
		ShowLoginError(LOCTEXT("MissingPassword", "Enter your password."));
		return;
	}

	ClearLoginFeedback();
	SetLoginInProgress(true);
	OnLoginRequested.Broadcast(Username, Password, GetSelectedServerName(), ShouldRememberAccount());
}

void UMMOLoginWidget::HandleCreateAccountClicked()
{
	ShowLoginError(LOCTEXT("CreateAccountUnavailable", "Account creation is not configured."));
}

void UMMOLoginWidget::HandleForgotPasswordClicked()
{
	ShowLoginError(LOCTEXT("ForgotPasswordUnavailable", "Password recovery is not configured."));
}

void UMMOLoginWidget::HandleQuitClicked()
{
	OnQuitRequested.Broadcast();
}

void UMMOLoginWidget::HandleUsernameCommitted(const FText& Text, const ETextCommit::Type CommitMethod)
{
	if (CommitMethod == ETextCommit::OnEnter && PasswordInput)
	{
		PasswordInput->SetKeyboardFocus();
	}
}

void UMMOLoginWidget::HandlePasswordCommitted(const FText& Text, const ETextCommit::Type CommitMethod)
{
	if (CommitMethod == ETextCommit::OnEnter)
	{
		HandleLoginClicked();
	}
}

#undef LOCTEXT_NAMESPACE
