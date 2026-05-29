/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Recordings_Count_OneInputs */

const uk_recordings_count_one = /** @type {(inputs: Recordings_Count_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} запис`)
};

const en_recordings_count_one = /** @type {(inputs: Recordings_Count_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} recording`)
};

/**
* | output |
* | --- |
* | "{count} recording" |
*
* @param {Recordings_Count_OneInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const recordings_count_one = /** @type {((inputs: Recordings_Count_OneInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Recordings_Count_OneInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_recordings_count_one(inputs)
	return en_recordings_count_one(inputs)
});