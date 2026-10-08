// Copyright Epic Games, Inc. All Rights Reserved.

#include "MMOWebBrowser.h"
#include "SWebBrowser.h"
#include "Misc/Paths.h"

UMMOWebBrowser::UMMOWebBrowser(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	bSupportsTransparency = true;
	InitialURL = FString::Printf(
		TEXT("file:///%sWebUI/index.html"),
		*FPaths::ConvertRelativePathToFull(FPaths::ProjectContentDir()));
}

void UMMOWebBrowser::BindObject(const FString& Name, UObject* Object)
{
	if (WebBrowserWidget.IsValid() && Object)
	{
		WebBrowserWidget->BindUObject(Name, Object, /*bIsPermanent*/ true);
		bBound = true;
	}
}

void UMMOWebBrowser::ReloadPage()
{
	if (WebBrowserWidget.IsValid())
	{
		WebBrowserWidget->Reload();
	}
}

void UMMOWebBrowser::EvalJs(const FString& Script)
{
	if (WebBrowserWidget.IsValid())
	{
		WebBrowserWidget->ExecuteJavascript(Script);
	}
}

void UMMOWebBrowser::ReleaseSlateResources(bool bReleaseChildren)
{
	// The SWebBrowser (and its UObject bindings) dies with the slate widget —
	// reset so NativeTick re-binds and reloads the page after a rebuild.
	bBound = false;
	Super::ReleaseSlateResources(bReleaseChildren);
}
