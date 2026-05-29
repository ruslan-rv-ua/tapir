/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Recordings_Count_FewInputs */

const uk_recordings_count_few = /** @type {(inputs: Recordings_Count_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} записи`)
};

const en_recordings_count_few = /** @type {(inputs: Recordings_Count_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} recordings`)
};

/**
* | output |
* | --- |
* | "{count} recordings" |
*
* @param {Recordings_Count_FewInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const recordings_count_few = /** @type {((inputs: Recordings_Count_FewInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Recordings_Count_FewInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_recordings_count_few(inputs)
	return en_recordings_count_few(inputs)
});