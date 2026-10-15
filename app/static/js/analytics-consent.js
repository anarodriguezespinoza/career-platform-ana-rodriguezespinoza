// Opt-in Google Analytics. gtag.js is never requested until the visitor accepts.
// The choice lives in the first-party `analytics_consent` cookie; Global Privacy Control counts as a decline.
(function () {
  "use strict";

  var COOKIE = "analytics_consent";
  var MAX_AGE = 60 * 60 * 24 * 180; // ask again after 180 days
  var script = document.currentScript;
  var measurementId = script && script.dataset.measurementId;
  if (!measurementId || window.__analyticsConsentLoaded) return;
  window.__analyticsConsentLoaded = true;

  function gpcEnabled() {
    return navigator.globalPrivacyControl === true;
  }

  function readChoice() {
    var match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=(granted|denied)"));
    return match ? match[1] : null;
  }

  function saveChoice(value) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = COOKIE + "=" + value + "; Max-Age=" + MAX_AGE + "; Path=/; SameSite=Lax" + secure;
  }

  function deleteAnalyticsCookies() {
    var host = location.hostname;
    var domains = ["", "; Domain=" + host, "; Domain=." + host.replace(/^www\./, "")];
    document.cookie.split("; ").forEach(function (pair) {
      var name = pair.split("=")[0];
      if (name !== "_ga" && name.indexOf("_ga_") !== 0) return;
      domains.forEach(function (domain) {
        document.cookie = name + "=; Max-Age=0; Path=/" + domain;
      });
    });
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  function loadAnalytics() {
    if (window.__gtagLoaded) return;
    window.__gtagLoaded = true;
    gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    gtag("js", new Date());
    gtag("config", measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    document.head.appendChild(tag);
  }

  function banner() {
    return document.getElementById("analytics-consent");
  }

  function hideBanner() {
    var element = banner();
    if (element) element.hidden = true;
  }

  function showBanner() {
    var element = banner();
    if (!element) return;
    var gpcNote = element.querySelector("[data-consent-gpc]");
    var accept = element.querySelector("[data-consent-accept]");
    if (gpcNote) gpcNote.hidden = !gpcEnabled();
    if (accept) accept.hidden = gpcEnabled();
    element.hidden = false;
  }

  function accept() {
    if (gpcEnabled()) return;
    saveChoice("granted");
    hideBanner();
    loadAnalytics();
  }

  function decline() {
    var wasLoaded = window.__gtagLoaded;
    saveChoice("denied");
    deleteAnalyticsCookies();
    hideBanner();
    // A loaded gtag.js can't be unloaded; reload so the page runs without it.
    if (wasLoaded) location.reload();
  }

  function init() {
    var element = banner();
    if (element) {
      element.querySelector("[data-consent-accept]").addEventListener("click", accept);
      element.querySelector("[data-consent-decline]").addEventListener("click", decline);
    }
    document.querySelectorAll("[data-consent-open]").forEach(function (button) {
      button.hidden = false;
      button.addEventListener("click", showBanner);
    });

    var choice = readChoice();
    if (gpcEnabled()) {
      if (choice === "granted") deleteAnalyticsCookies();
      return;
    }
    if (choice === "granted") loadAnalytics();
    else if (choice !== "denied") showBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
