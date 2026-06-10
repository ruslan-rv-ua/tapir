/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkeys_Reset_DoneInputs */

const uk_settings_hotkeys_reset_done = /** @type {(inputs: Settings_Hotkeys_Reset_DoneInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Гарячі клавіші скинуто до стандартних`)
};

const en_settings_hotkeys_reset_done = /** @type {(inputs: Settings_Hotkeys_Reset_DoneInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Hotkeys reset to defaults`)
};

/**
* | output |
* | --- |
* | "Hotkeys reset to defaults" |
*
* @param {Settings_Hotkeys_Reset_DoneInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkeys_reset_done = /** @type {((inputs?: Settings_Hotkeys_Reset_DoneInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkeys_Reset_DoneInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkeys_reset_done(inputs)
	return en_settings_hotkeys_reset_done(inputs)
});