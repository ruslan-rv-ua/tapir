/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ action: NonNullable<unknown> }} Settings_Hotkey_ReservedInputs */

const uk_settings_hotkey_reserved = /** @type {(inputs: Settings_Hotkey_ReservedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Цю комбінацію зарезервовано для: ${i?.action}`)
};

const en_settings_hotkey_reserved = /** @type {(inputs: Settings_Hotkey_ReservedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`This combination is reserved for: ${i?.action}`)
};

/**
* | output |
* | --- |
* | "This combination is reserved for: {action}" |
*
* @param {Settings_Hotkey_ReservedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_reserved = /** @type {((inputs: Settings_Hotkey_ReservedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_ReservedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_reserved(inputs)
	return en_settings_hotkey_reserved(inputs)
});