/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Recordings_Count_ZeroInputs */

const uk_recordings_count_zero = /** @type {(inputs: Recordings_Count_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Немає записів`)
};

const en_recordings_count_zero = /** @type {(inputs: Recordings_Count_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No recordings`)
};

/**
* | output |
* | --- |
* | "No recordings" |
*
* @param {Recordings_Count_ZeroInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const recordings_count_zero = /** @type {((inputs?: Recordings_Count_ZeroInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Recordings_Count_ZeroInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_recordings_count_zero(inputs)
	return en_recordings_count_zero(inputs)
});