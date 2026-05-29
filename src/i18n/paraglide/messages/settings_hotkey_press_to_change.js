/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Press_To_ChangeInputs */

const uk_settings_hotkey_press_to_change = /** @type {(inputs: Settings_Hotkey_Press_To_ChangeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Натисніть щоб змінити`)
};

const en_settings_hotkey_press_to_change = /** @type {(inputs: Settings_Hotkey_Press_To_ChangeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Press to change`)
};

/**
* | output |
* | --- |
* | "Press to change" |
*
* @param {Settings_Hotkey_Press_To_ChangeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_press_to_change = /** @type {((inputs?: Settings_Hotkey_Press_To_ChangeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Press_To_ChangeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_press_to_change(inputs)
	return en_settings_hotkey_press_to_change(inputs)
});