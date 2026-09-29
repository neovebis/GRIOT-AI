package com.griot.app.plugin;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.nativead.MediaView;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdView;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "GriotAdsPlugin")
public class GriotAdsPlugin extends Plugin {
    private static final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT;
    private final Map<String, AdSlot> slots = new HashMap<>();
    private ConsentInformation consentInformation;
    private boolean initialized = false;

    private static class AdSlot {
        FrameLayout host;
        NativeAd ad;
        boolean loading;
        long lastLoadAttempt;
        int width;
        int height;
        boolean darkMode;
    }

    @PluginMethod
    public void initializeAds(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (initialized) {
                call.resolve(readiness());
                return;
            }

            consentInformation = UserMessagingPlatform.getConsentInformation(activity);
            ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
            consentInformation.requestConsentInfoUpdate(
                activity,
                params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(
                    activity,
                    formError -> {
                        if (formError != null) {
                            android.util.Log.w("GRIOT Ads", formError.getMessage());
                        }
                        startAdsIfAllowed();
                        call.resolve(readiness());
                    }
                ),
                requestError -> {
                    android.util.Log.w("GRIOT Ads", requestError.getMessage());
                    startAdsIfAllowed();
                    call.resolve(readiness());
                }
            );
        });
    }

    @PluginMethod
    public void showNativeAd(PluginCall call) {
        Activity activity = getActivity();
        String slotId = call.getString("slotId", "");
        if (slotId.isEmpty()) {
            call.reject("slotId em falta");
            return;
        }

        activity.runOnUiThread(() -> {
            if (!initialized || (consentInformation != null && !consentInformation.canRequestAds())) {
                JSObject result = new JSObject();
                result.put("shown", false);
                call.resolve(result);
                return;
            }

            AdSlot slot = slots.get(slotId);
            if (slot == null) {
                slot = new AdSlot();
                slot.host = new FrameLayout(activity);
                slot.host.setClipToOutline(true);
                slot.host.setVisibility(View.INVISIBLE);
                activity.addContentView(slot.host, new ViewGroup.LayoutParams(1, 1));
                slots.put(slotId, slot);
            }

            slot.width = cssToPx(call.getDouble("width", 0.0));
            slot.height = cssToPx(call.getDouble("height", 0.0));
            slot.darkMode = Boolean.TRUE.equals(call.getBoolean("darkMode", true));
            place(slot, call.getDouble("x", 0.0), call.getDouble("y", 0.0));
            if (slot.ad != null) slot.host.setVisibility(View.VISIBLE);

            if (slot.ad == null && !slot.loading && System.currentTimeMillis() - slot.lastLoadAttempt > 30_000) loadAd(slot);
            JSObject result = new JSObject();
            result.put("shown", slot.ad != null);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void hideNativeAd(PluginCall call) {
        String slotId = call.getString("slotId", "");
        getActivity().runOnUiThread(() -> {
            AdSlot slot = slots.get(slotId);
            if (slot != null) slot.host.setVisibility(View.GONE);
            call.resolve();
        });
    }

    @PluginMethod
    public void destroyNativeAd(PluginCall call) {
        String slotId = call.getString("slotId", "");
        getActivity().runOnUiThread(() -> {
            AdSlot slot = slots.remove(slotId);
            if (slot != null) {
                if (slot.ad != null) slot.ad.destroy();
                ViewGroup parent = (ViewGroup) slot.host.getParent();
                if (parent != null) parent.removeView(slot.host);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void showAdPrivacyOptions(PluginCall call) {
        getActivity().runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(
            getActivity(),
            error -> {
                if (error != null) call.reject(error.getMessage());
                else call.resolve();
            }
        ));
    }

    @Override
    protected void handleOnDestroy() {
        for (AdSlot slot : slots.values()) {
            if (slot.ad != null) slot.ad.destroy();
        }
        slots.clear();
        super.handleOnDestroy();
    }

    private void startAdsIfAllowed() {
        if (initialized) return;
        if (consentInformation == null || consentInformation.canRequestAds()) {
            MobileAds.initialize(getContext(), status -> {});
            initialized = true;
        }
    }

    private JSObject readiness() {
        JSObject result = new JSObject();
        result.put("ready", initialized);
        boolean privacyRequired = consentInformation != null &&
            consentInformation.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
        result.put("privacyOptionsRequired", privacyRequired);
        return result;
    }

    private void loadAd(AdSlot slot) {
        slot.loading = true;
        slot.lastLoadAttempt = System.currentTimeMillis();
        String adUnitId = getContext().getString(com.griot.app.R.string.admob_native_ad_unit_id);
        AdLoader loader = new AdLoader.Builder(getContext(), adUnitId)
            .forNativeAd(ad -> {
                slot.loading = false;
                if (slot.ad != null) slot.ad.destroy();
                slot.ad = ad;
                renderAd(slot, ad);
                slot.host.setVisibility(View.VISIBLE);
            })
            .withAdListener(new com.google.android.gms.ads.AdListener() {
                @Override
                public void onAdFailedToLoad(@NonNull com.google.android.gms.ads.LoadAdError error) {
                    slot.loading = false;
                    slot.host.setVisibility(View.GONE);
                    android.util.Log.w("GRIOT Ads", "Falha ao carregar anúncio: " + error.getMessage());
                }
            })
            .build();
        loader.loadAd(new AdRequest.Builder().build());
    }

    private void place(AdSlot slot, double cssX, double cssY) {
        int[] webViewLocation = new int[2];
        int[] contentLocation = new int[2];
        getBridge().getWebView().getLocationOnScreen(webViewLocation);
        View content = getActivity().findViewById(android.R.id.content);
        content.getLocationOnScreen(contentLocation);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            Math.max(slot.width, 1), Math.max(slot.height, 1)
        );
        params.leftMargin = webViewLocation[0] - contentLocation[0] + cssToPx(cssX);
        params.topMargin = webViewLocation[1] - contentLocation[1] + cssToPx(cssY);
        slot.host.setLayoutParams(params);
        slot.host.setElevation(cssToPx(2));
    }

    private void renderAd(AdSlot slot, NativeAd ad) {
        NativeAdView adView = new NativeAdView(getContext());
        adView.setPadding(cssToPx(10), cssToPx(8), cssToPx(10), cssToPx(8));
        adView.setBackground(roundedBackground(slot.darkMode));

        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        if (ad.getIcon() != null) {
            ImageView icon = new ImageView(getContext());
            icon.setImageDrawable(ad.getIcon().getDrawable());
            icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
            GradientDrawable iconBg = new GradientDrawable();
            iconBg.setCornerRadius(cssToPx(10));
            icon.setBackground(iconBg);
            icon.setClipToOutline(true);
            row.addView(icon, new LinearLayout.LayoutParams(cssToPx(40), cssToPx(40)));
            adView.setIconView(icon);
        } else {
            MediaView media = new MediaView(getContext());
            media.setImageScaleType(ImageView.ScaleType.CENTER_CROP);
            row.addView(media, new LinearLayout.LayoutParams(cssToPx(50), MATCH));
            adView.setMediaView(media);
        }

        LinearLayout textColumn = new LinearLayout(getContext());
        textColumn.setOrientation(LinearLayout.VERTICAL);
        textColumn.setPadding(cssToPx(10), 0, cssToPx(8), 0);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        row.addView(textColumn, textParams);

        TextView advertiser = textView(9, slot.darkMode, false, 1);
        String sponsor = ad.getAdvertiser() == null ? "Patrocinado" : ad.getAdvertiser();
        advertiser.setText(sponsor + "  ·  Anúncio");
        advertiser.setAlpha(0.6f);
        textColumn.addView(advertiser);
        adView.setAdvertiserView(advertiser);

        TextView headline = textView(12, slot.darkMode, true, 1);
        headline.setText(ad.getHeadline() == null ? "" : ad.getHeadline());
        textColumn.addView(headline);
        adView.setHeadlineView(headline);

        TextView body = textView(10, slot.darkMode, false, 1);
        body.setAlpha(0.7f);
        body.setText(ad.getBody() == null ? "" : ad.getBody());
        body.setVisibility(ad.getBody() == null ? View.GONE : View.VISIBLE);
        textColumn.addView(body);
        adView.setBodyView(body);

        Button cta = new Button(getContext());
        cta.setAllCaps(false);
        cta.setTextSize(10);
        cta.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        cta.setMinWidth(0);
        cta.setMinimumWidth(0);
        cta.setPadding(cssToPx(12), 0, cssToPx(12), 0);
        cta.setText(ad.getCallToAction() == null ? "Abrir" : ad.getCallToAction());
        GradientDrawable ctaBg = new GradientDrawable();
        ctaBg.setColor(slot.darkMode ? Color.rgb(240, 240, 240) : Color.rgb(24, 24, 27));
        ctaBg.setCornerRadius(cssToPx(10));
        cta.setBackground(ctaBg);
        cta.setTextColor(slot.darkMode ? Color.rgb(20, 20, 20) : Color.WHITE);
        cta.setElevation(0);
        cta.setStateListAnimator(null);
        row.addView(cta, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, cssToPx(32)));
        adView.setCallToActionView(cta);

        adView.addView(row, new FrameLayout.LayoutParams(MATCH, MATCH));
        adView.setNativeAd(ad);
        slot.host.removeAllViews();
        slot.host.addView(adView, new FrameLayout.LayoutParams(MATCH, MATCH));
    }

    private TextView textView(int sizeSp, boolean darkMode, boolean bold, int lines) {
        TextView view = new TextView(getContext());
        view.setTextColor(darkMode ? Color.WHITE : Color.rgb(24, 24, 24));
        view.setTextSize(sizeSp);
        view.setMaxLines(lines);
        view.setEllipsize(android.text.TextUtils.TruncateAt.END);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable roundedBackground(boolean darkMode) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(darkMode ? Color.rgb(24, 24, 27) : Color.rgb(250, 250, 250));
        background.setCornerRadius(cssToPx(16));
        background.setStroke(cssToPx(1), darkMode ? Color.rgb(45, 45, 48) : Color.rgb(228, 228, 231));
        return background;
    }

    private int cssToPx(double cssPixels) {
        return (int) Math.round(cssPixels * getContext().getResources().getDisplayMetrics().density);
    }
}