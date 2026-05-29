/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Press_KeysInputs */

const uk_settings_hotkey_press_keys = /** @type {(inputs: Settings_Hotkey_Press_KeysInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Натисніть клавіші...`)
};

const en_settings_hotkey_press_keys = /** @type {(inputs: Settings_Hotkey_Press_KeysInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Press keys...`)
};

/**
* | output |
* | --- |
* | "Press keys..." |
*
* @param {Settings_Hotkey_Press_KeysInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_press_keys = /** @type {((inputs?: Settings_Hotkey_Press_KeysInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Press_KeysInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_press_keys(inputs)
	return en_settings_hotkey_press_keys(inputs)
});