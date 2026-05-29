/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Max_RetriesInputs */

const uk_settings_max_retries = /** @type {(inputs: Settings_Max_RetriesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Максимум спроб перепідключення`)
};

const en_settings_max_retries = /** @type {(inputs: Settings_Max_RetriesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Max reconnection attempts`)
};

/**
* | output |
* | --- |
* | "Max reconnection attempts" |
*
* @param {Settings_Max_RetriesInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_max_retries = /** @type {((inputs?: Settings_Max_RetriesInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Max_RetriesInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_max_retries(inputs)
	return en_settings_max_retries(inputs)
});