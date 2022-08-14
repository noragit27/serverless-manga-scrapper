import { getMockReq, getMockRes } from "@jest-mock/express";
import { jest } from "@jest/globals";
import scrape from "./scrape";
import scraper from "../services/scraper";
import db from "../db";

jest.mock("../services/scraper");
jest.mock("../services/logger");
jest.mock("../db");

describe("Unit test", () => {
	const { res, clearMockRes } = getMockRes();
	beforeEach(() => {
		clearMockRes();
		jest.clearAllMocks();
	});

	describe("scrape.mangaList behaviour", () => {
		test("Scraper return new data --> respond 202 --> process scraped data", async () => {
			const expectedUrlString = "https://www.asurascans.com/manga/list-mode/";
			const scraperSpy = scraper.mockImplementation(() => {
				const result = new Set();
				result.add(new Map([ ["EntryId", "Entry 1"], ["EntrySlug", "This is a test entry 1"] ]));
				result.add(new Map([ ["EntryId", "Entry 2"], ["EntrySlug", "This is a test entry 2"] ]));
				result.add(new Map([ ["EntryId", "Entry 3"], ["EntrySlug", "This is a test entry 3"] ]));
				return result;
			});
			const createStatusSpy = db.createStatus.mockImplementation();
			const getEntrySpy = db.getEntry.mockImplementation(() => null);
			const createEntrySpy = db.createEntry.mockImplementation();
			const updateStatusSpy = db.updateStatus.mockImplementation();

			const req = getMockReq({ body: { provider: "asura" } });
			await scrape.mangaList(req, res);

			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"MangaList",
				"asura"
			);
			expect(createStatusSpy).toHaveBeenCalledWith(
				expect.objectContaining({ RequestStatus: "pending" })
			);
			expect(res.status).toHaveBeenCalledWith(202);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 202,
					statusText: expect.any(String),
					data: expect.any(Object),
				})
			);
			expect(getEntrySpy).toHaveBeenCalledTimes(3);
			expect(createEntrySpy).toHaveBeenCalledTimes(3);
			expect(updateStatusSpy).toHaveBeenCalledWith(
				expect.objectContaining({ RequestStatus: "completed" })
			);
		});

		test("Scraper return old data --> respond 202 --> inform old data", async () => {
			const expectedUrlString = "https://www.asurascans.com/manga/list-mode/";
			const scraperSpy = scraper.mockImplementation(() => {
				const result = new Set();
				result.add(new Map([ ["EntryId", "Entry 1"], ["EntrySlug", "This is a test entry 1"] ]));
				result.add(new Map([ ["EntryId", "Entry 2"], ["EntrySlug", "This is a test entry 2"] ]));
				result.add(new Map([ ["EntryId", "Entry 3"], ["EntrySlug", "This is a test entry 3"] ]));
				return result;
			});
			const createStatusSpy = db.createStatus.mockImplementation();
			const getEntrySpy = db.getEntry.mockImplementation(() => true);
			const createEntrySpy = db.createEntry.mockImplementation();
			const updateStatusSpy = db.updateStatus.mockImplementation();

			const req = getMockReq({ body: { provider: "asura" } });
			await scrape.mangaList(req, res);

			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"MangaList",
				"asura"
			);
			expect(createStatusSpy).toHaveBeenCalledWith(
				expect.objectContaining({ RequestStatus: "pending" })
			);
			expect(getEntrySpy).toHaveBeenCalledTimes(3);
			expect(createEntrySpy).not.toHaveBeenCalled();
			expect(updateStatusSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					RequestStatus: "completed",
					FailedItems: expect.any(Array),
				})
			);
			expect(res.status).toHaveBeenCalledWith(202);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 202,
					statusText: expect.any(String),
					data: expect.any(Object),
				})
			);
		});

		test("Crawler/scraper failed to process request --> request aborted", async () => {
			const expectedUrlString = "https://www.asurascans.com/manga/list-mode/";
			const scraperSpy = scraper.mockImplementation(() => {
				return Error(`Failed to crawl '${expectedUrlString}'`, { cause: 404 });
			});
	
			const req = getMockReq({ body: { provider: "asura" } });
			await scrape.mangaList(req, res);
	
			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"MangaList",
				"asura"
			);
			expect(scraperSpy).toHaveReturnedWith(expect.any(Error));
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 404,
					statusText: expect.any(String),
				})
			);
		});

		test("Error occurs on the server/database --> 500", async () => {
			scraper.mockImplementation(() => {
				const result = new Set();
				result.add(new Map([ ["EntryId", "Entry 1"], ["EntrySlug", "This is a test entry 1"] ]));
				result.add(new Map([ ["EntryId", "Entry 2"], ["EntrySlug", "This is a test entry 2"] ]));
				result.add(new Map([ ["EntryId", "Entry 3"], ["EntrySlug", "This is a test entry 3"] ]));
				return result;
			});
			const createStatusSpy = db.createStatus.mockImplementation(() => {
				throw new Error("This is just a test");
			});

			const req = getMockReq({ body: { provider: "asura" } });
			await scrape.mangaList(req, res);

			expect(createStatusSpy).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 500,
					statusText: expect.any(String),
				})
			);
		});
	});

	describe("scrape.manga behaviour", () => {
		test("Scraper return new data --> process scraped data --> respond 201", async () => {
			const expectedUrlString = "https://luminousscans.com/series/a-returners-magic-should-be-special/";
			const scraperSpy = scraper.mockImplementation(() => {
				const result = new Map([
					["EntryId", `manga_luminous_a-returners-magic-should-be-special`],
					["EntrySlug", "a-returners-magic-should-be-special"],
				]);
				return result;
			});
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				return {
					MangaUrl: expectedUrlString
				}
			});
			const updateMangaEntrySpy = db.updateMangaEntry.mockImplementation();

			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.manga(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"Manga",
				"luminous"
			);
			expect(updateMangaEntrySpy).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 201,
					statusText: "Created",
					data: expect.any(Object),
				})
			);
		});

		test("Full data exists in the database --> 409", async () => {
			const expectedUrlString = "https://luminousscans.com/series/a-returners-magic-should-be-special/";
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				return {
					MangaUrl: expectedUrlString,
					MangaCover: "This is just a test",
				}
			});

			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.manga(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(res.status).toHaveBeenCalledWith(409);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 409,
					statusText: expect.any(String),
				})
			);
		});

		test("Initial data does not exist in the database --> 404", async () => {
			const getEntrySpy = db.getEntry.mockImplementation(() => false);
			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.manga(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 404,
					statusText: expect.any(String),
				})
			);
		});

		test("Crawler/scraper failed to process request --> request aborted", async () => {
			const expectedUrlString = "https://luminousscans.com/series/a-returners-magic-should-be-special/";
			const scraperSpy = scraper.mockImplementation(() => {
				return Error(`Failed to crawl '${expectedUrlString}'`, { cause: 404 });
			});
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				return {
					MangaUrl: expectedUrlString
				}
			});
	
			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.manga(req, res);
	
			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"Manga",
				"luminous"
			);
			expect(scraperSpy).toHaveReturnedWith(expect.any(Error));
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 404,
					statusText: expect.any(String),
				})
			);
		});

		test("Error occurs on the server/database --> 500", async () => {
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				throw new Error("This is just a test");
			});
			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.manga(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 500,
					statusText: expect.any(String),
				})
			);
		});
	});

	describe("scrape.chapterList behaviour", () => {
		test("Scraper return new data --> respond 202 --> process scraped data", async () => {
			const expectedUrlString = "https://luminousscans.com/series/a-returners-magic-should-be-special/";
			const scraperSpy = scraper.mockImplementation(() => {
				const result = new Set();
				result.add(new Map([ ["EntryId", "Entry 1"], ["EntrySlug", "This is a test entry 1"] ]));
				result.add(new Map([ ["EntryId", "Entry 2"], ["EntrySlug", "This is a test entry 2"] ]));
				result.add(new Map([ ["EntryId", "Entry 3"], ["EntrySlug", "This is a test entry 3"] ]));
				return result;
			});
			const getEntrySpy = db.getEntry;
			getEntrySpy.mockImplementationOnce(() => {
				return { MangaUrl: expectedUrlString };
			});
			getEntrySpy.mockImplementation(() => null);
			const createStatusSpy = db.createStatus.mockImplementation();
			const createEntrySpy = db.createEntry.mockImplementation();
			const updateStatusSpy = db.updateStatus.mockImplementation();
			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.chapterList(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"ChapterList",
				"luminous"
			);
			expect(createStatusSpy).toHaveBeenCalledWith(
				expect.objectContaining({ RequestStatus: "pending" })
			);
			expect(res.status).toHaveBeenCalledWith(202);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 202,
					statusText: expect.any(String),
					data: expect.any(Object),
				})
			);
			expect(getEntrySpy).toHaveBeenCalledTimes(4);
			expect(createEntrySpy).toHaveBeenCalledTimes(3);
			expect(updateStatusSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					RequestStatus: "completed",
				})
			);
		});

		test("Scraper return old data --> respond 202 --> inform old data", async () => {
			const expectedUrlString = "https://luminousscans.com/series/a-returners-magic-should-be-special/";
			const scraperSpy = scraper.mockImplementation(() => {
				const result = new Set();
				result.add(new Map([ ["EntryId", "Entry 1"], ["EntrySlug", "This is a test entry 1"] ]));
				result.add(new Map([ ["EntryId", "Entry 2"], ["EntrySlug", "This is a test entry 2"] ]));
				result.add(new Map([ ["EntryId", "Entry 3"], ["EntrySlug", "This is a test entry 3"] ]));
				return result;
			});
			const getEntrySpy = db.getEntry;
			getEntrySpy.mockImplementationOnce(() => {
				return { MangaUrl: expectedUrlString };
			});
			getEntrySpy.mockImplementation(() => true);
			const createStatusSpy = db.createStatus.mockImplementation();
			const createEntrySpy = db.createEntry.mockImplementation();
			const updateStatusSpy = db.updateStatus.mockImplementation();
			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.chapterList(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"ChapterList",
				"luminous"
			);
			expect(createStatusSpy).toHaveBeenCalledWith(
				expect.objectContaining({ RequestStatus: "pending" })
			);
			expect(res.status).toHaveBeenCalledWith(202);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 202,
					statusText: expect.any(String),
					data: expect.any(Object),
				})
			);
			expect(getEntrySpy).toHaveBeenCalledTimes(4);
			expect(createEntrySpy).not.toHaveBeenCalled();
			expect(updateStatusSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					RequestStatus: "completed",
					FailedItems: expect.any(Array),
				})
			);
		});

		test("Initial data does not exist in the database --> 404", async () => {
			const getEntrySpy = db.getEntry.mockImplementation(() => false);
			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.chapterList(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 404,
					statusText: expect.any(String),
				})
			);
		});

		test("Crawler/scraper failed to process request --> request aborted", async () => {
			const expectedUrlString = "https://luminousscans.com/series/a-returners-magic-should-be-special/";
			const scraperSpy = scraper.mockImplementation(() => {
				return Error(`Failed to crawl '${expectedUrlString}'`, { cause: 404 });
			});
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				return {
					MangaUrl: expectedUrlString
				}
			});
	
			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.chapterList(req, res);
	
			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"ChapterList",
				"luminous"
			);
			expect(scraperSpy).toHaveReturnedWith(expect.any(Error));
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 404,
					statusText: expect.any(String),
				})
			);
		});

		test("Error occurs on the server/database --> 500", async () => {
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				throw new Error("This is just a test");
			});
			const req = getMockReq({
				body: {
					provider: "luminous",
					slug: "a-returners-magic-should-be-special",
				},
			});
			await scrape.chapterList(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("manga_luminous", "a-returners-magic-should-be-special");
			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 500,
					statusText: expect.any(String),
				})
			);
		});
	});

	describe("scrape.chapter behaviour", () => {
		test("Scraper return new data --> process scraped data --> respond 201", async () => {
			const expectedUrlString = "https://luminousscans.com/a-returners-magic-should-be-special-chapter-1/";
			const scraperSpy = scraper.mockImplementation(() => {
				const result = new Map([
					["EntryId", `chapter_luminous_a-returners-magic-should-be-special`],
					["EntrySlug", "a-returners-magic-should-be-special-chapter-1"],
				]);
				return result;
			});
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				return {
					ChapterUrl: expectedUrlString
				}
			});
			const updateChapterEntrySpy = db.updateChapterEntry.mockImplementation();

			const req = getMockReq({
				body: {
					provider: "luminous",
					manga: "a-returners-magic-should-be-special",
					slug: "a-returners-magic-should-be-special-chapter-1",
				},
			});
			await scrape.chapter(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("chapter_luminous_a-returners-magic-should-be-special", "a-returners-magic-should-be-special-chapter-1");
			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"Chapter",
				"luminous"
			);
			expect(updateChapterEntrySpy).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 201,
					statusText: "Created",
					data: expect.any(Object),
				})
			);
		});

		test("Full data exists in the database --> 409", async () => {
			const expectedUrlString = "https://luminousscans.com/a-returners-magic-should-be-special-chapter-1/";
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				return {
					ChapterUrl: expectedUrlString,
					ChapterContent: "This is just a test",
				}
			});

			const req = getMockReq({
				body: {
					provider: "luminous",
					manga: "a-returners-magic-should-be-special",
					slug: "a-returners-magic-should-be-special-chapter-1",
				},
			});
			await scrape.chapter(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("chapter_luminous_a-returners-magic-should-be-special", "a-returners-magic-should-be-special-chapter-1");
			expect(res.status).toHaveBeenCalledWith(409);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 409,
					statusText: expect.any(String),
				})
			);
		});

		test("Initial data does not exist in the database --> 404", async () => {
			const getEntrySpy = db.getEntry.mockImplementation(() => false);
			const req = getMockReq({
				body: {
					provider: "luminous",
					manga: "a-returners-magic-should-be-special",
					slug: "a-returners-magic-should-be-special-chapter-1",
				},
			});
			await scrape.chapter(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("chapter_luminous_a-returners-magic-should-be-special", "a-returners-magic-should-be-special-chapter-1");
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 404,
					statusText: expect.any(String),
				})
			);
		});

		test("Crawler/scraper failed to process request --> request aborted", async () => {
			const expectedUrlString = "https://luminousscans.com/a-returners-magic-should-be-special-chapter-1/";
			const scraperSpy = scraper.mockImplementation(() => {
				return Error(`Failed to crawl '${expectedUrlString}'`, { cause: 404 });
			});
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				return {
					ChapterUrl: expectedUrlString,
				}
			});
	
			const req = getMockReq({
				body: {
					provider: "luminous",
					manga: "a-returners-magic-should-be-special",
					slug: "a-returners-magic-should-be-special-chapter-1",
				},
			});
			await scrape.chapter(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("chapter_luminous_a-returners-magic-should-be-special", "a-returners-magic-should-be-special-chapter-1");
			expect(scraperSpy).toHaveBeenCalledWith(
				expectedUrlString,
				"Chapter",
				"luminous"
			);
			expect(scraperSpy).toHaveReturnedWith(expect.any(Error));
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 404,
					statusText: expect.any(String),
				})
			);
		});

		test("Error occurs on the server/database --> 500", async () => {
			const getEntrySpy = db.getEntry.mockImplementation(() => {
				throw new Error("This is just a test");
			});
			const req = getMockReq({
				body: {
					provider: "luminous",
					manga: "a-returners-magic-should-be-special",
					slug: "a-returners-magic-should-be-special-chapter-1",
				},
			});
			await scrape.chapter(req, res);

			expect(getEntrySpy).toHaveBeenCalledWith("chapter_luminous_a-returners-magic-should-be-special", "a-returners-magic-should-be-special-chapter-1");
			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 500,
					statusText: expect.any(String),
				})
			);
		});
	});
});
