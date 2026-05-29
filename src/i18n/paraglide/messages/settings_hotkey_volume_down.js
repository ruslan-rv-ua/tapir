/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Volume_DownInputs */

const uk_settings_hotkey_volume_down = /** @type {(inputs: Settings_Hotkey_Volume_DownInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Гучність −`)
};

const en_settings_hotkey_volume_down = /** @type {(inputs: Settings_Hotkey_Volume_DownInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Volume down`)
};

/**
* | output |
* | --- |
* | "Volume down" |
*
* @param {Settings_Hotkey_Volume_DownInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_volume_down = /** @type {((inputs?: Settings_Hotkey_Volume_DownInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Volume_DownInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_volume_down(inputs)
	return en_settings_hotkey_volume_down(inputs)
});