/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_AdvancedInputs */

const uk_settings_log_advanced = /** @type {(inputs: Settings_Log_AdvancedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Додатково`)
};

const en_settings_log_advanced = /** @type {(inputs: Settings_Log_AdvancedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Advanced`)
};

/**
* | output |
* | --- |
* | "Advanced" |
*
* @param {Settings_Log_AdvancedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_advanced = /** @type {((inputs?: Settings_Log_AdvancedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_AdvancedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_advanced(inputs)
	return en_settings_log_advanced(inputs)
});