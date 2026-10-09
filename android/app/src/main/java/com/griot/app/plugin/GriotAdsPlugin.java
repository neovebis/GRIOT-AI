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
import com.google.android.gms.ads.nativead.AdChoicesView;
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

        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            JSObject result = new JSObject();
            result.put("shown", false);
            call.resolve(result);
            return;
        }

        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) {
                JSObject result = new JSObject();
                result.put("shown", false);
                call.resolve(result);
                return;
            }

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
                slot.host.setBackgroundColor(Color.TRANSPARENT);
                slot.host.setElevation(0);
                slot.host.setClipToOutline(true);
                slot.host.setVisibility(View.INVISIBLE);
                activity.addContentView(slot.host, new ViewGroup.LayoutParams(1, 1));
                slots.put(slotId, slot);
            }

            slot.width = cssToPx(call.getDouble("width", 0.0));
            slot.height = cssToPx(call.getDouble("height", 0.0));
            slot.darkMode = Boolean.TRUE.equals(call.getBoolean("darkMode", true));
            place(slot, call.getDouble("x", 0.0), call.getDouble("y", 0.0));
            if (slot.ad != null && slot.host != null) slot.host.setVisibility(View.VISIBLE);

            if (slot.ad == null && !slot.loading && System.currentTimeMillis() - slot.lastLoadAttempt > 30_000) loadAd(slot);
            JSObject result = new JSObject();
            result.put("shown", slot.ad != null);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void hideNativeAd(PluginCall call) {
        String slotId = call.getString("slotId", "");
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            AdSlot slot = slots.get(slotId);
            if (slot != null && slot.host != null) slot.host.setVisibility(View.GONE);
            call.resolve();
        });
    }

    @PluginMethod
    public void destroyNativeAd(PluginCall call) {
        String slotId = call.getString("slotId", "");
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            AdSlot slot = slots.remove(slotId);
            if (slot != null) {
                if (slot.ad != null) {
                    slot.ad.destroy();
                    slot.ad = null;
                }
                slot.host = null;
            }
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            AdSlot slot = slots.remove(slotId);
            if (slot != null) {
                if (slot.ad != null) {
                    slot.ad.destroy();
                    slot.ad = null;
                }
                if (slot.host != null) {
                    ViewGroup parent = (ViewGroup) slot.host.getParent();
                    if (parent != null) parent.removeView(slot.host);
                    slot.host.removeAllViews();
                    slot.host = null;
                }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void showAdPrivacyOptions(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(
            activity,
            error -> {
                if (error != null) call.reject(error.getMessage());
                else call.resolve();
            }
        ));
    }

    @Override
    protected void handleOnDestroy() {
        for (AdSlot slot : slots.values()) {
            if (slot.ad != null) {
                slot.ad.destroy();
                slot.ad = null;
            }
            if (slot.host != null) {
                ViewGroup parent = (ViewGroup) slot.host.getParent();
                if (parent != null) {
                    parent.removeView(slot.host);
                }
                slot.host.removeAllViews();
                slot.host = null;
            }
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
                Activity currentActivity = getActivity();
                if (currentActivity == null || currentActivity.isFinishing() || currentActivity.isDestroyed()) {
                    ad.destroy();
                    return;
                }
                currentActivity.runOnUiThread(() -> {
                    slot.loading = false;
                    if (slot.ad != null) {
                        slot.ad.destroy();
                    }
                    slot.ad = ad;
                    renderAd(slot, ad);
                    if (slot.host != null) {
                        slot.host.setVisibility(View.VISIBLE);
                    }
                });
            })
            .withAdListener(new com.google.android.gms.ads.AdListener() {
                @Override
                public void onAdFailedToLoad(@NonNull com.google.android.gms.ads.LoadAdError error) {
                    slot.loading = false;
                    Activity currentActivity = getActivity();
                    if (currentActivity != null && !currentActivity.isFinishing() && !currentActivity.isDestroyed()) {
                        currentActivity.runOnUiThread(() -> {
                            if (slot.host != null) {
                                slot.host.setVisibility(View.GONE);
                            }
                        });
                    }
                    android.util.Log.w("GRIOT Ads", "Falha ao carregar anúncio: " + error.getMessage());
                }
            })
            .build();
        loader.loadAd(new AdRequest.Builder().build());
    }

    private void place(AdSlot slot, double cssX, double cssY) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) return;
        if (getBridge() == null || getBridge().getWebView() == null || slot.host == null) return;

        View content = activity.findViewById(android.R.id.content);
        if (content == null) return;

        int[] webViewLocation = new int[2];
        int[] contentLocation = new int[2];
        getBridge().getWebView().getLocationOnScreen(webViewLocation);
        content.getLocationOnScreen(contentLocation);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            Math.max(slot.width, 1), Math.max(slot.height, 1)
        );
        params.leftMargin = webViewLocation[0] - contentLocation[0] + cssToPx(cssX);
        params.topMargin = webViewLocation[1] - contentLocation[1] + cssToPx(cssY);
        slot.host.setLayoutParams(params);
        slot.host.setElevation(0);
    }

    private void renderAd(AdSlot slot, NativeAd ad) {
        NativeAdView adView = new NativeAdView(getContext());
        adView.setPadding(cssToPx(8), cssToPx(8), cssToPx(8), cssToPx(8));
        adView.setBackground(roundedBackground(slot.darkMode));

        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        // Lado esquerdo: miniatura quadrada/retangular do anúncio
        FrameLayout thumbContainer = new FrameLayout(getContext());
        GradientDrawable thumbBg = new GradientDrawable();
        thumbBg.setColor(Color.rgb(32, 32, 36));
        thumbBg.setCornerRadius(cssToPx(10));
        thumbContainer.setBackground(thumbBg);
        thumbContainer.setClipToOutline(true);

        MediaView mediaView = new MediaView(getContext());
        mediaView.setImageScaleType(ImageView.ScaleType.CENTER_CROP);
        thumbContainer.addView(mediaView, new FrameLayout.LayoutParams(MATCH, MATCH));
        adView.setMediaView(mediaView);

        if (ad.getMediaContent() == null || ad.getMediaContent().getMainImage() == null) {
            if (ad.getImages() != null && !ad.getImages().isEmpty() && ad.getImages().get(0).getDrawable() != null) {
                ImageView img = new ImageView(getContext());
                img.setImageDrawable(ad.getImages().get(0).getDrawable());
                img.setScaleType(ImageView.ScaleType.CENTER_CROP);
                thumbContainer.addView(img, new FrameLayout.LayoutParams(MATCH, MATCH));
            } else if (ad.getIcon() != null && ad.getIcon().getDrawable() != null) {
                ImageView img = new ImageView(getContext());
                img.setImageDrawable(ad.getIcon().getDrawable());
                img.setScaleType(ImageView.ScaleType.CENTER_CROP);
                thumbContainer.addView(img, new FrameLayout.LayoutParams(MATCH, MATCH));
            }
        }
        LinearLayout.LayoutParams thumbParams = new LinearLayout.LayoutParams(cssToPx(80), cssToPx(62));
        row.addView(thumbContainer, thumbParams);

        // Lado direito: coluna de informações
        LinearLayout rightColumn = new LinearLayout(getContext());
        rightColumn.setOrientation(LinearLayout.VERTICAL);
        rightColumn.setGravity(Gravity.CENTER_VERTICAL);
        rightColumn.setPadding(cssToPx(10), 0, cssToPx(2), 0);
        LinearLayout.LayoutParams colParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        row.addView(rightColumn, colParams);

        // Cabeçalho: ícone da marca + nome do anunciante + tag 'Anúncio' em pill cinzento + opções (3 pontos)
        LinearLayout headerRow = new LinearLayout(getContext());
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);

        if (ad.getIcon() != null && ad.getIcon().getDrawable() != null) {
            ImageView brandIcon = new ImageView(getContext());
            brandIcon.setImageDrawable(ad.getIcon().getDrawable());
            brandIcon.setScaleType(ImageView.ScaleType.CENTER_CROP);
            GradientDrawable iconBg = new GradientDrawable();
            iconBg.setColor(Color.rgb(36, 36, 42));
            iconBg.setCornerRadius(cssToPx(4));
            brandIcon.setBackground(iconBg);
            brandIcon.setClipToOutline(true);
            LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(cssToPx(14), cssToPx(14));
            iconParams.rightMargin = cssToPx(5);
            headerRow.addView(brandIcon, iconParams);
            adView.setIconView(brandIcon);
        }

        TextView advertiser = new TextView(getContext());
        advertiser.setTextSize(10.5f);
        advertiser.setTextColor(slot.darkMode ? Color.rgb(212, 212, 216) : Color.rgb(63, 63, 70));
        advertiser.setMaxLines(1);
        advertiser.setEllipsize(android.text.TextUtils.TruncateAt.END);
        String sponsor = ad.getAdvertiser() != null && !ad.getAdvertiser().trim().isEmpty()
            ? ad.getAdvertiser().trim()
            : "Patrocinado";
        advertiser.setText(sponsor);
        LinearLayout.LayoutParams advParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        advParams.rightMargin = cssToPx(6);
        headerRow.addView(advertiser, advParams);
        adView.setAdvertiserView(advertiser);

        TextView tag = new TextView(getContext());
        tag.setText("Anúncio");
        tag.setTextSize(8.5f);
        tag.setTextColor(slot.darkMode ? Color.rgb(161, 161, 170) : Color.rgb(113, 113, 122));
        tag.setPadding(cssToPx(5), cssToPx(1), cssToPx(5), cssToPx(1));
        GradientDrawable tagBg = new GradientDrawable();
        tagBg.setColor(slot.darkMode ? Color.rgb(39, 39, 42) : Color.rgb(228, 228, 231));
        tagBg.setCornerRadius(cssToPx(4));
        tagBg.setStroke(cssToPx(1), Color.argb(25, 255, 255, 255));
        tag.setBackground(tagBg);
        headerRow.addView(tag, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        View spacer = new View(getContext());
        LinearLayout.LayoutParams spacerParams = new LinearLayout.LayoutParams(0, 0, 1.0f);
        headerRow.addView(spacer, spacerParams);

        AdChoicesView adChoicesView = new AdChoicesView(getContext());
        headerRow.addView(adChoicesView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        adView.setAdChoicesView(adChoicesView);

        TextView optionsDots = new TextView(getContext());
        optionsDots.setText("⋮");
        optionsDots.setTextSize(13f);
        optionsDots.setTextColor(slot.darkMode ? Color.rgb(113, 113, 122) : Color.rgb(161, 161, 170));
        optionsDots.setPadding(cssToPx(4), 0, cssToPx(2), 0);
        headerRow.addView(optionsDots, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        rightColumn.addView(headerRow, new LinearLayout.LayoutParams(MATCH, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Título a negrito em destaque
        TextView headline = new TextView(getContext());
        headline.setText(ad.getHeadline() != null ? ad.getHeadline() : "");
        headline.setTextSize(12f);
        headline.setTextColor(slot.darkMode ? Color.WHITE : Color.rgb(24, 24, 27));
        headline.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        headline.setMaxLines(1);
        headline.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams headlineParams = new LinearLayout.LayoutParams(
            MATCH, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        headlineParams.topMargin = cssToPx(2);
        rightColumn.addView(headline, headlineParams);
        adView.setHeadlineView(headline);

        // Descrição sucinta truncada em no máximo 2 linhas com reticências
        if (ad.getBody() != null && !ad.getBody().trim().isEmpty()) {
            TextView body = new TextView(getContext());
            body.setText(ad.getBody().trim());
            body.setTextSize(10.5f);
            body.setTextColor(slot.darkMode ? Color.rgb(161, 161, 170) : Color.rgb(100, 100, 108));
            body.setMaxLines(2);
            body.setEllipsize(android.text.TextUtils.TruncateAt.END);
            body.setLineSpacing(cssToPx(1), 1.0f);
            LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(
                MATCH, ViewGroup.LayoutParams.WRAP_CONTENT
            );
            bodyParams.topMargin = cssToPx(1);
            rightColumn.addView(body, bodyParams);
            adView.setBodyView(body);
        }

        adView.setCallToActionView(adView);
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
        background.setColor(darkMode ? Color.rgb(24, 24, 27) : Color.rgb(244, 244, 246));
        background.setCornerRadius(cssToPx(16));
        background.setStroke(cssToPx(1), darkMode ? Color.rgb(39, 39, 42) : Color.rgb(228, 228, 231));
        return background;
    }

    private int cssToPx(double cssPixels) {
        return (int) Math.round(cssPixels * getContext().getResources().getDisplayMetrics().density);
    }
}