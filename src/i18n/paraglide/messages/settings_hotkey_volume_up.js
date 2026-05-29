/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Volume_UpInputs */

const uk_settings_hotkey_volume_up = /** @type {(inputs: Settings_Hotkey_Volume_UpInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Гучність +`)
};

const en_settings_hotkey_volume_up = /** @type {(inputs: Settings_Hotkey_Volume_UpInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Volume up`)
};

/**
* | output |
* | --- |
* | "Volume up" |
*
* @param {Settings_Hotkey_Volume_UpInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_volume_up = /** @type {((inputs?: Settings_Hotkey_Volume_UpInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Volume_UpInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_volume_up(inputs)
	return en_settings_hotkey_volume_up(inputs)
});