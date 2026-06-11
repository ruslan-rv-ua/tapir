/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ action: NonNullable<unknown> }} Settings_Hotkey_ClearInputs */

const uk_settings_hotkey_clear = /** @type {(inputs: Settings_Hotkey_ClearInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Очистити хоткей: ${i?.action}`)
};

const en_settings_hotkey_clear = /** @type {(inputs: Settings_Hotkey_ClearInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Clear hotkey: ${i?.action}`)
};

/**
* | output |
* | --- |
* | "Clear hotkey: {action}" |
*
* @param {Settings_Hotkey_ClearInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_clear = /** @type {((inputs: Settings_Hotkey_ClearInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_ClearInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_clear(inputs)
	return en_settings_hotkey_clear(inputs)
});