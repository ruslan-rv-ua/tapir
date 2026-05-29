/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Column_DurationInputs */

const uk_column_duration = /** @type {(inputs: Column_DurationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Тривалість`)
};

const en_column_duration = /** @type {(inputs: Column_DurationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Duration`)
};

/**
* | output |
* | --- |
* | "Duration" |
*
* @param {Column_DurationInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const column_duration = /** @type {((inputs?: Column_DurationInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Column_DurationInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_column_duration(inputs)
	return en_column_duration(inputs)
});