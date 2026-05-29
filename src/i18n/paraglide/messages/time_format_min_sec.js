/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ min: NonNullable<unknown>, sec: NonNullable<unknown> }} Time_Format_Min_SecInputs */

const uk_time_format_min_sec = /** @type {(inputs: Time_Format_Min_SecInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.min} хв ${i?.sec} с`)
};

const en_time_format_min_sec = /** @type {(inputs: Time_Format_Min_SecInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.min} min ${i?.sec} sec`)
};

/**
* | output |
* | --- |
* | "{min} min {sec} sec" |
*
* @param {Time_Format_Min_SecInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const time_format_min_sec = /** @type {((inputs: Time_Format_Min_SecInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Time_Format_Min_SecInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_time_format_min_sec(inputs)
	return en_time_format_min_sec(inputs)
});