/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Toggle_WindowInputs */

const uk_settings_hotkey_toggle_window = /** @type {(inputs: Settings_Hotkey_Toggle_WindowInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Показати/сховати вікно`)
};

const en_settings_hotkey_toggle_window = /** @type {(inputs: Settings_Hotkey_Toggle_WindowInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Show/hide window`)
};

/**
* | output |
* | --- |
* | "Show/hide window" |
*
* @param {Settings_Hotkey_Toggle_WindowInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_toggle_window = /** @type {((inputs?: Settings_Hotkey_Toggle_WindowInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Toggle_WindowInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_toggle_window(inputs)
	return en_settings_hotkey_toggle_window(inputs)
});