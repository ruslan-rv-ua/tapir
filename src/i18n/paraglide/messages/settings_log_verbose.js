/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_VerboseInputs */

const uk_settings_log_verbose = /** @type {(inputs: Settings_Log_VerboseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Детальне логування для діагностики`)
};

const en_settings_log_verbose = /** @type {(inputs: Settings_Log_VerboseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Detailed logging for diagnostics`)
};

/**
* | output |
* | --- |
* | "Detailed logging for diagnostics" |
*
* @param {Settings_Log_VerboseInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_verbose = /** @type {((inputs?: Settings_Log_VerboseInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_VerboseInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_verbose(inputs)
	return en_settings_log_verbose(inputs)
});