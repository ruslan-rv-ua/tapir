/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Profile_Stream_Count_OneInputs */

const uk_profile_stream_count_one = /** @type {(inputs: Profile_Stream_Count_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} потік`)
};

const en_profile_stream_count_one = /** @type {(inputs: Profile_Stream_Count_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} stream`)
};

/**
* | output |
* | --- |
* | "{count} stream" |
*
* @param {Profile_Stream_Count_OneInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_stream_count_one = /** @type {((inputs: Profile_Stream_Count_OneInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Stream_Count_OneInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_stream_count_one(inputs)
	return en_profile_stream_count_one(inputs)
});