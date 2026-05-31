/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_Verbose_DescInputs */

const uk_settings_log_verbose_desc = /** @type {(inputs: Settings_Log_Verbose_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Допомагає розробнику знайти причину збою. Діє після перезапуску.`)
};

const en_settings_log_verbose_desc = /** @type {(inputs: Settings_Log_Verbose_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Helps the developer find the cause of a problem. Takes effect after restart.`)
};

/**
* | output |
* | --- |
* | "Helps the developer find the cause of a problem. Takes effect after restart." |
*
* @param {Settings_Log_Verbose_DescInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_verbose_desc = /** @type {((inputs?: Settings_Log_Verbose_DescInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_Verbose_DescInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_verbose_desc(inputs)
	return en_settings_log_verbose_desc(inputs)
});