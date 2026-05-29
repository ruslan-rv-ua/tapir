/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Recordings_Count_ManyInputs */

const uk_recordings_count_many = /** @type {(inputs: Recordings_Count_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} записів`)
};

const en_recordings_count_many = /** @type {(inputs: Recordings_Count_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} recordings`)
};

/**
* | output |
* | --- |
* | "{count} recordings" |
*
* @param {Recordings_Count_ManyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const recordings_count_many = /** @type {((inputs: Recordings_Count_ManyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Recordings_Count_ManyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_recordings_count_many(inputs)
	return en_recordings_count_many(inputs)
});