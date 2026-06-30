function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('platform-mac state-on')[0].innerText = "Send to Anytype’s extension is currently on. You can turn it off in the Extensions section of Safari Settings.";
        document.getElementsByClassName('platform-mac state-off')[0].innerText = "Send to Anytype’s extension is currently off. You can turn it on in the Extensions section of Safari Settings.";
        document.getElementsByClassName('platform-mac state-unknown')[0].innerText = "You can turn on Send to Anytype’s extension in the Extensions section of Safari Settings.";
        document.getElementsByClassName('platform-mac open-preferences')[0].innerText = "Quit and Open Safari Settings…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

// Called from ViewController.swift on webView didFinish. Values come from the
// app bundle's Info.plist (CFBundleShortVersionString + CFBundleVersion),
// which are populated at build time from MARKETING_VERSION /
// CURRENT_PROJECT_VERSION in the pbxproj — so what's displayed here is
// guaranteed to match the bundle the user is actually running.
function setVersion(shortVersion, buildVersion) {
    const el = document.getElementById("app-version");
    if (!el) return;
    el.textContent = buildVersion && buildVersion !== shortVersion
        ? `${shortVersion} (build ${buildVersion})`
        : shortVersion;
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
