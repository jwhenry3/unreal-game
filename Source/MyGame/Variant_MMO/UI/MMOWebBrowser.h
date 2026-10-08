// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "WebBrowser.h"
#include "MMOWebBrowser.generated.h"

class SWebBrowser;

/**
 *  UWebBrowser subclass that exposes the JS object binding API and defaults
 *  to a transparent page loaded from Content/WebUI.
 *
 *  With bSupportsTransparency, transparent pixels in the DOM composite through
 *  to whatever sits beneath the browser widget in the UMG stack — that is what
 *  lets native scene-capture images show through "holes" in the web UI.
 */
UCLASS(BlueprintType)
class UMMOWebBrowser : public UWebBrowser
{
	GENERATED_BODY()

public:

	UMMOWebBrowser(const FObjectInitializer& ObjectInitializer);

	/** Bind a UObject so JS can invoke its UFUNCTIONs as ue.<name>.<fn>(). */
	void BindObject(const FString& Name, UObject* Object);

	/** True once the underlying slate browser exists and the bind was applied. */
	bool IsBound() const { return bBound; }

	/** Force a page reload (used after binding so the doc sees the object). */
	void ReloadPage();

	/** Run a script in the page (UE -> JS direction). No-op until the slate browser exists. */
	void EvalJs(const FString& Script);

protected:

	virtual void ReleaseSlateResources(bool bReleaseChildren) override;

	bool bBound = false;
};
