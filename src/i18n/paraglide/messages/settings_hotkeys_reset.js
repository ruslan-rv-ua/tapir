/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkeys_ResetInputs */

const uk_settings_hotkeys_reset = /** @type {(inputs: Settings_Hotkeys_ResetInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Скинути до стандартних`)
};

const en_settings_hotkeys_reset = /** @type {(inputs: Settings_Hotkeys_ResetInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Reset to defaults`)
};

/**
* | output |
* | --- |
* | "Reset to defaults" |
*
* @param {Settings_Hotkeys_ResetInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkeys_reset = /** @type {((inputs?: Settings_Hotkeys_ResetInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkeys_ResetInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkeys_reset(inputs)
	return en_settings_hotkeys_reset(inputs)
});