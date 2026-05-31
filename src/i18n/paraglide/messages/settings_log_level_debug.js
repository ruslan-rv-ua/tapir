/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_Level_DebugInputs */

const uk_settings_log_level_debug = /** @type {(inputs: Settings_Log_Level_DebugInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зневадження`)
};

const en_settings_log_level_debug = /** @type {(inputs: Settings_Log_Level_DebugInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Debug`)
};

/**
* | output |
* | --- |
* | "Debug" |
*
* @param {Settings_Log_Level_DebugInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_level_debug = /** @type {((inputs?: Settings_Log_Level_DebugInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_Level_DebugInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_level_debug(inputs)
	return en_settings_log_level_debug(inputs)
});