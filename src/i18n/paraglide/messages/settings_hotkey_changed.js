/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ combo: NonNullable<unknown> }} Settings_Hotkey_ChangedInputs */

const uk_settings_hotkey_changed = /** @type {(inputs: Settings_Hotkey_ChangedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Хоткей змінено: ${i?.combo}`)
};

const en_settings_hotkey_changed = /** @type {(inputs: Settings_Hotkey_ChangedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Hotkey changed: ${i?.combo}`)
};

/**
* | output |
* | --- |
* | "Hotkey changed: {combo}" |
*
* @param {Settings_Hotkey_ChangedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_changed = /** @type {((inputs: Settings_Hotkey_ChangedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_ChangedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_changed(inputs)
	return en_settings_hotkey_changed(inputs)
});