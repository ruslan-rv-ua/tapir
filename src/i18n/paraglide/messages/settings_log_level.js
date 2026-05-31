/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_LevelInputs */

const uk_settings_log_level = /** @type {(inputs: Settings_Log_LevelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Рівень логування`)
};

const en_settings_log_level = /** @type {(inputs: Settings_Log_LevelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Log level`)
};

/**
* | output |
* | --- |
* | "Log level" |
*
* @param {Settings_Log_LevelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_level = /** @type {((inputs?: Settings_Log_LevelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_LevelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_level(inputs)
	return en_settings_log_level(inputs)
});