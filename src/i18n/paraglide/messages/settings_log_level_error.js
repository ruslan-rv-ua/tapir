/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_Level_ErrorInputs */

const uk_settings_log_level_error = /** @type {(inputs: Settings_Log_Level_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Помилки`)
};

const en_settings_log_level_error = /** @type {(inputs: Settings_Log_Level_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Error`)
};

/**
* | output |
* | --- |
* | "Error" |
*
* @param {Settings_Log_Level_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_level_error = /** @type {((inputs?: Settings_Log_Level_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_Level_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_level_error(inputs)
	return en_settings_log_level_error(inputs)
});