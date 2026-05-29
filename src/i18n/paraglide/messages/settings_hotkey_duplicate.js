/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ action: NonNullable<unknown> }} Settings_Hotkey_DuplicateInputs */

const uk_settings_hotkey_duplicate = /** @type {(inputs: Settings_Hotkey_DuplicateInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Цю комбінацію вже використано для: ${i?.action}`)
};

const en_settings_hotkey_duplicate = /** @type {(inputs: Settings_Hotkey_DuplicateInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`This combination is already used for: ${i?.action}`)
};

/**
* | output |
* | --- |
* | "This combination is already used for: {action}" |
*
* @param {Settings_Hotkey_DuplicateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_duplicate = /** @type {((inputs: Settings_Hotkey_DuplicateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_DuplicateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_duplicate(inputs)
	return en_settings_hotkey_duplicate(inputs)
});