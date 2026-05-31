/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_Level_InfoInputs */

const uk_settings_log_level_info = /** @type {(inputs: Settings_Log_Level_InfoInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Інформація`)
};

const en_settings_log_level_info = /** @type {(inputs: Settings_Log_Level_InfoInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Info`)
};

/**
* | output |
* | --- |
* | "Info" |
*
* @param {Settings_Log_Level_InfoInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_level_info = /** @type {((inputs?: Settings_Log_Level_InfoInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_Level_InfoInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_level_info(inputs)
	return en_settings_log_level_info(inputs)
});