/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_Max_SizeInputs */

const uk_settings_log_max_size = /** @type {(inputs: Settings_Log_Max_SizeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Макс. розмір файлу логу (МБ)`)
};

const en_settings_log_max_size = /** @type {(inputs: Settings_Log_Max_SizeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Max log file size (MB)`)
};

/**
* | output |
* | --- |
* | "Max log file size (MB)" |
*
* @param {Settings_Log_Max_SizeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_max_size = /** @type {((inputs?: Settings_Log_Max_SizeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_Max_SizeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_max_size(inputs)
	return en_settings_log_max_size(inputs)
});