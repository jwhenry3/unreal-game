// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class MyGame : ModuleRules
{
	public MyGame(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"AIModule",
			"StateTreeModule",
			"GameplayStateTreeModule",
			"UMG",
			"Slate",
			"SlateCore",
			"WebBrowser",
			"WebBrowserWidget"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { "Json", "JsonUtilities", "HTTP" });

		PublicIncludePaths.AddRange(new string[] {
			"MyGame",
			"MyGame/Variant_Platforming",
			"MyGame/Variant_Platforming/Animation",
			"MyGame/Variant_Combat",
			"MyGame/Variant_Combat/AI",
			"MyGame/Variant_Combat/Animation",
			"MyGame/Variant_Combat/Gameplay",
			"MyGame/Variant_Combat/Interfaces",
			"MyGame/Variant_Combat/UI",
			"MyGame/Variant_SideScrolling",
			"MyGame/Variant_SideScrolling/AI",
			"MyGame/Variant_SideScrolling/Gameplay",
			"MyGame/Variant_SideScrolling/Interfaces",
			"MyGame/Variant_SideScrolling/UI",
			"MyGame/Variant_MMO",
			"MyGame/Variant_MMO/UI"
		});

		// Uncomment if you are using Slate UI
		// PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

		// Uncomment if you are using online features
		// PrivateDependencyModuleNames.Add("OnlineSubsystem");

		// To include OnlineSubsystemSteam, add it to the plugins section in your uproject file with the Enabled attribute set to true
	}
}
