/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Tab_HotkeysInputs */

const uk_settings_tab_hotkeys = /** @type {(inputs: Settings_Tab_HotkeysInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Гарячі клавіші`)
};

const en_settings_tab_hotkeys = /** @type {(inputs: Settings_Tab_HotkeysInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Hotkeys`)
};

/**
* | output |
* | --- |
* | "Hotkeys" |
*
* @param {Settings_Tab_HotkeysInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_tab_hotkeys = /** @type {((inputs?: Settings_Tab_HotkeysInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Tab_HotkeysInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_tab_hotkeys(inputs)
	return en_settings_tab_hotkeys(inputs)
});