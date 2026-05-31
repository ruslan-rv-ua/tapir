/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Log_Keep_HistoryInputs */

const uk_settings_log_keep_history = /** @type {(inputs: Settings_Log_Keep_HistoryInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зберігати всю історію логів`)
};

const en_settings_log_keep_history = /** @type {(inputs: Settings_Log_Keep_HistoryInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Keep full log history`)
};

/**
* | output |
* | --- |
* | "Keep full log history" |
*
* @param {Settings_Log_Keep_HistoryInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_log_keep_history = /** @type {((inputs?: Settings_Log_Keep_HistoryInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Log_Keep_HistoryInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_log_keep_history(inputs)
	return en_settings_log_keep_history(inputs)
});