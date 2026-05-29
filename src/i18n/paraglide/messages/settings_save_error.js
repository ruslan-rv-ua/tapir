/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Save_ErrorInputs */

const uk_settings_save_error = /** @type {(inputs: Settings_Save_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Помилка збереження налаштувань`)
};

const en_settings_save_error = /** @type {(inputs: Settings_Save_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Error saving settings`)
};

/**
* | output |
* | --- |
* | "Error saving settings" |
*
* @param {Settings_Save_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_save_error = /** @type {((inputs?: Settings_Save_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Save_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_save_error(inputs)
	return en_settings_save_error(inputs)
});