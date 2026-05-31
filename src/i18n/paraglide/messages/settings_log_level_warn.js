/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_Level_WarnInputs */

const uk_settings_log_level_warn = /** @type {(inputs: Settings_Log_Level_WarnInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Попередження`)
};

const en_settings_log_level_warn = /** @type {(inputs: Settings_Log_Level_WarnInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Warning`)
};

/**
* | output |
* | --- |
* | "Warning" |
*
* @param {Settings_Log_Level_WarnInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_level_warn = /** @type {((inputs?: Settings_Log_Level_WarnInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_Level_WarnInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_level_warn(inputs)
	return en_settings_log_level_warn(inputs)
});