/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Record_AllInputs */

const uk_record_all = /** @type {(inputs: Record_AllInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Записати все`)
};

const en_record_all = /** @type {(inputs: Record_AllInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Record all`)
};

/**
* | output |
* | --- |
* | "Record all" |
*
* @param {Record_AllInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const record_all = /** @type {((inputs?: Record_AllInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Record_AllInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_record_all(inputs)
	return en_record_all(inputs)
});